import { BrowserContext, CDPSession, expect, Page, Route, test as base } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NO_SERVER_PAYMENT, routeApiDefaults } from '../fixtures';
import { qrCodeY4m } from '../receipt-code-files';
import { requestsInFlight, settled } from '../settled';
import { builtDist, PwaSite, startPwaSite } from './pwa-site';

export type DisplayMode = 'browser' | 'standalone' | 'ios-home-screen';

export interface WorkerState {
  readonly scriptURL: string;
  readonly state: string;
}

export interface CacheEntry {
  readonly cache: string;
  readonly url: string;
}

export interface StorageDump {
  readonly localStorage: Record<string, string>;
  readonly sessionStorage: Record<string, string>;
  readonly cookies: readonly string[];
  readonly databases: readonly string[];
  readonly caches: readonly string[];
}

export type IdbDump = Record<string, Record<string, readonly unknown[]>>;

export interface BrowserProblems {
  expectOne(pattern: RegExp): void;
}

export interface VirtualAuthenticator {
  readonly authenticatorId: string;
  credentialCount(): Promise<number>;
}

interface PwaOptions {
  displayMode: DisplayMode;
  allowedConsoleErrors: readonly RegExp[];
}

interface PwaWorkerOptions {
  cameraShows: string | undefined;
  pwaDist: string;
}

interface PwaFixtures {
  site: PwaSite;
  pwaApi: void;
  pageRequests: () => number;
  browserProblems: BrowserProblems;
  standaloneStub: void;
  swReady: () => Promise<WorkerState>;
  goOffline: () => Promise<void>;
  goOnline: () => Promise<void>;
  idbDump: () => Promise<IdbDump>;
  cacheDump: () => Promise<readonly CacheEntry[]>;
  storageDump: () => Promise<StorageDump>;
  virtualAuthenticator: VirtualAuthenticator;
}

interface PwaWorkerFixtures {
  pwaSite: PwaSite;
}

const OFFLINE = (route: Route): Promise<void> => route.abort('internetdisconnected');

const PAGE_ROUTING = ['route', 'unroute', 'routeFromHAR'] as const;

const VIOLATION_BINDING = '__nfnnPwaSecurityPolicyViolation';
const READY_TIMEOUT_MS = 10_000;
const CLAIM_TIMEOUT_MS = 5_000;
const SETTLE_TIMEOUT_MS = 10_000;
const EXPECTED_PROBLEM_TIMEOUT_MS = 5_000;

async function waitForController(page: Page): Promise<boolean> {
  return page.evaluate(
    async ({ readyMs, claimMs }) => {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`no service worker became ready within ${readyMs} ms`)),
            readyMs,
          ),
        ),
      ]);
      if (navigator.serviceWorker.controller === null) {
        await new Promise((claimed) => {
          navigator.serviceWorker.addEventListener('controllerchange', claimed, { once: true });
          setTimeout(claimed, claimMs);
        });
      }
      return navigator.serviceWorker.controller !== null;
    },
    { readyMs: READY_TIMEOUT_MS, claimMs: CLAIM_TIMEOUT_MS },
  );
}

async function flushPendingReports(context: BrowserContext): Promise<void> {
  for (const open of context.pages()) {
    await open.evaluate(() => new Promise((done) => setTimeout(done))).catch(() => undefined);
  }
}

export const pwaTest = base.extend<PwaFixtures & PwaOptions, PwaWorkerFixtures & PwaWorkerOptions>({
  displayMode: ['browser', { option: true }],
  allowedConsoleErrors: [[], { option: true }],
  cameraShows: [undefined, { option: true, scope: 'worker' }],
  pwaDist: [builtDist(), { option: true, scope: 'worker' }],

  pwaSite: [
    async ({ pwaDist }, use) => {
      const site = await startPwaSite(pwaDist);
      await use(site);
      await site.dispose();
    },
    { scope: 'worker', timeout: 60_000 },
  ],

  launchOptions: [
    async ({ launchOptions, cameraShows }, use) => {
      if (cameraShows === undefined) {
        await use(launchOptions);
        return;
      }
      const folder = mkdtempSync(join(tmpdir(), 'nfnn-pwa-camera-'));
      const video = join(folder, 'camera.y4m');
      writeFileSync(video, qrCodeY4m(cameraShows));
      try {
        await use({
          ...launchOptions,
          args: [
            ...(launchOptions.args ?? []),
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${video}`,
          ],
        });
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],

  permissions: async ({ permissions, cameraShows }, use) => {
    await use(cameraShows === undefined ? permissions : [...(permissions ?? []), 'camera']);
  },

  site: [
    async ({ pwaSite }, use) => {
      await use(pwaSite);
      await pwaSite.reset();
    },
    { auto: true },
  ],

  baseURL: async ({ pwaSite }, use) => {
    await use(pwaSite.url);
  },

  pwaApi: [
    async ({ context }, use) => {
      const askedForServerPayment = await routeApiDefaults(context);
      await use();
      expect(askedForServerPayment, NO_SERVER_PAYMENT).toEqual([]);
    },
    { auto: true },
  ],

  page: async ({ page }, use) => {
    for (const name of PAGE_ROUTING) {
      Object.defineProperty(page, name, {
        configurable: true,
        value: () =>
          Promise.reject(
            new Error(
              `page.${name} is refused in the pwa project: route on the context (context.route), which also answers the service worker's requests`,
            ),
          ),
      });
    }
    await use(page);
  },

  pageRequests: async ({ page }, use) => {
    await use(requestsInFlight(page));
  },

  browserProblems: [
    async ({ context, allowedConsoleErrors }, use) => {
      const problems: string[] = [];
      const expected: RegExp[] = [];
      const record = (kind: string, text: string, where: string | undefined): void => {
        const located = where === undefined || where === '' ? text : `${text} (${where})`;
        if (!allowedConsoleErrors.some((pattern) => pattern.test(located))) {
          problems.push(`${kind}: ${located}`);
        }
      };
      context.on('console', (message) => {
        if (message.type() === 'error') {
          record('console error', message.text(), message.location().url);
        }
      });
      context.on('weberror', (error) => {
        record('uncaught error', error.error().message, error.page()?.url());
      });
      await context.exposeBinding(
        VIOLATION_BINDING,
        (_source, violation: { text: string; where: string }) => {
          record('Content-Security-Policy violation', violation.text, violation.where);
        },
      );
      await context.addInitScript((binding) => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as Record<string, (sent: object) => void>)[binding];
          report({
            text: `${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`,
            where: event.documentURI,
          });
        });
      }, VIOLATION_BINDING);
      await use({ expectOne: (pattern) => expected.push(pattern) });
      await flushPendingReports(context);
      for (const pattern of expected) {
        await expect
          .poll(() => problems.some((problem) => pattern.test(problem)), {
            message: `the fixture records the expected problem ${pattern}`,
            timeout: EXPECTED_PROBLEM_TIMEOUT_MS,
          })
          .toBe(true);
        problems.splice(
          problems.findIndex((problem) => pattern.test(problem)),
          1,
        );
      }
      expect(
        problems,
        'no page or service worker of the installed web app logs a console error, and no page throws an uncaught error or violates a Content-Security-Policy directive',
      ).toEqual([]);
    },
    { auto: true },
  ],

  standaloneStub: [
    async ({ context, displayMode }, use) => {
      if (displayMode !== 'browser') {
        await context.addInitScript((homeScreen) => {
          const matchMedia = window.matchMedia.bind(window);
          const answers: Record<string, boolean> = {
            '(display-mode:standalone)': true,
            '(display-mode:browser)': false,
          };
          window.matchMedia = (query: string): MediaQueryList => {
            const real = matchMedia(query);
            const answer = answers[query.replace(/\s+/g, '').toLowerCase()];
            if (answer === undefined) {
              return real;
            }
            const fixed = (value: unknown): PropertyDescriptor => ({ value, enumerable: true });
            return Object.create(Object.getPrototypeOf(real) as object, {
              matches: fixed(answer),
              media: fixed(real.media),
              onchange: { value: null, writable: true },
              addListener: fixed(() => undefined),
              removeListener: fixed(() => undefined),
              addEventListener: fixed(() => undefined),
              removeEventListener: fixed(() => undefined),
              dispatchEvent: fixed(() => false),
            }) as MediaQueryList;
          };
          if (homeScreen) {
            Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
          }
        }, displayMode === 'ios-home-screen');
      }
      await use();
    },
    { auto: true },
  ],

  swReady: async ({ page, pageRequests }, use) => {
    await use(async () => {
      if (!(await waitForController(page))) {
        await page.reload();
        expect(
          await waitForController(page),
          'the service worker controls the page after one reload',
        ).toBe(true);
      }
      await settled(page, pageRequests, SETTLE_TIMEOUT_MS);
      return page.evaluate(() => {
        const controller = navigator.serviceWorker.controller;
        return { scriptURL: controller?.scriptURL ?? '', state: controller?.state ?? '' };
      });
    });
  },

  goOffline: async ({ context }, use) => {
    await use(async () => {
      await context.setOffline(true);
      await context.route('**/*', OFFLINE);
    });
  },

  goOnline: async ({ context }, use) => {
    await use(async () => {
      await context.unroute('**/*', OFFLINE);
      await context.setOffline(false);
    });
  },

  idbDump: async ({ page }, use) => {
    await use(() =>
      page.evaluate(async () => {
        const request = <T>(asked: IDBRequest<T>): Promise<T> =>
          new Promise((resolve, reject) => {
            asked.onsuccess = () => resolve(asked.result);
            asked.onerror = () => reject(asked.error);
          });
        const dump: Record<string, Record<string, unknown[]>> = {};
        for (const { name } of await indexedDB.databases()) {
          if (name === undefined) {
            continue;
          }
          const database = await request(indexedDB.open(name));
          const stores: Record<string, unknown[]> = {};
          for (const store of Array.from(database.objectStoreNames)) {
            stores[store] = await request(
              database.transaction(store, 'readonly').objectStore(store).getAll(),
            );
          }
          database.close();
          dump[name] = stores;
        }
        return dump;
      }),
    );
  },

  cacheDump: async ({ page }, use) => {
    await use(() =>
      page.evaluate(async () => {
        const entries: { cache: string; url: string }[] = [];
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const request of await cache.keys()) {
            const url = new URL(request.url);
            entries.push({ cache: name, url: `${url.pathname}${url.search}` });
          }
        }
        return entries.sort((one, other) => one.url.localeCompare(other.url));
      }),
    );
  },

  storageDump: async ({ page, context }, use) => {
    await use(async () => {
      const inPage = await page.evaluate(async () => {
        const all = (storage: Storage): Record<string, string> =>
          Object.fromEntries(
            Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? '')
              .sort()
              .map((key) => [key, storage.getItem(key) ?? '']),
          );
        return {
          localStorage: all(window.localStorage),
          sessionStorage: all(window.sessionStorage),
          databases: (await indexedDB.databases()).map((database) => database.name ?? '').sort(),
          caches: (await caches.keys()).sort(),
        };
      });
      const cookies = (await context.cookies()).map((cookie) => cookie.name).sort();
      return { ...inPage, cookies };
    });
  },

  virtualAuthenticator: async ({ page }, use) => {
    const cdp: CDPSession = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        ctap2Version: 'ctap2_1',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        hasPrf: true,
        automaticPresenceSimulation: true,
      },
    });
    await use({
      authenticatorId,
      credentialCount: async () =>
        (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length,
    });
    await cdp
      .send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
      .then(() => cdp.detach())
      .catch(() => undefined);
  },
});

export { expect };
