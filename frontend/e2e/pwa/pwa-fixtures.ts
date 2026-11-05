import { BrowserContext, CDPSession, expect, Page, Route, test as base } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unmockedApi } from '../fixtures';
import { FOUNDATION_PAYMENT_DETAILS } from '../qr-matrices';
import { qrCodeY4m } from '../receipt-code-files';
import { builtDist, PwaSite, startPwaSite } from './pwa-site';

export type DisplayMode = 'browser' | 'standalone';

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
  browserProblems: void;
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

const VIOLATION_BINDING = '__nfnnPwaSecurityPolicyViolation';

async function routeApiByDefault(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(unmockedApi),
  );
  await context.route(
    (url) => url.pathname === '/api/operations/setup',
    (route) => route.fulfill({ json: { required: false, codeRequired: true } }),
  );
  await context.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [], projects: [] } }),
  );
  await context.route(
    (url) => url.pathname === '/api/donations/payment-details',
    (route) => route.fulfill({ json: FOUNDATION_PAYMENT_DETAILS }),
  );
}

async function waitForController(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });
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
      const video = join(mkdtempSync(join(tmpdir(), 'nfnn-pwa-camera-')), 'camera.y4m');
      writeFileSync(video, qrCodeY4m(cameraShows));
      await use({
        ...launchOptions,
        args: [
          ...(launchOptions.args ?? []),
          '--use-fake-device-for-media-stream',
          `--use-file-for-fake-video-capture=${video}`,
        ],
      });
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
      await routeApiByDefault(context);
      await use();
    },
    { auto: true },
  ],

  browserProblems: [
    async ({ context, allowedConsoleErrors }, use) => {
      const problems: string[] = [];
      const allowed = (text: string): boolean =>
        allowedConsoleErrors.some((pattern) => pattern.test(text));
      context.on('console', (message) => {
        const where = message.location().url;
        const text = where === '' ? message.text() : `${message.text()} (${where})`;
        if (message.type() === 'error' && !allowed(text)) {
          problems.push(`console error: ${text}`);
        }
      });
      context.on('weberror', (error) => {
        if (!allowed(error.error().message)) {
          problems.push(`uncaught error: ${error.error().message}`);
        }
      });
      await context.exposeBinding(VIOLATION_BINDING, (_source, violation: string) => {
        if (!allowed(violation)) {
          problems.push(`Content-Security-Policy violation: ${violation}`);
        }
      });
      await context.addInitScript((binding) => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as Record<string, (text: string) => void>)[binding];
          report(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`);
        });
      }, VIOLATION_BINDING);
      await use();
      expect(
        problems,
        'a page of the installed web app logs no console error, throws nothing uncaught and violates no Content-Security-Policy directive',
      ).toEqual([]);
    },
    { auto: true },
  ],

  standaloneStub: [
    async ({ context, displayMode }, use) => {
      if (displayMode === 'standalone') {
        await context.addInitScript(() => {
          const matchMedia = window.matchMedia.bind(window);
          const standalone = /\(\s*display-mode\s*:\s*standalone\s*\)/;
          window.matchMedia = (query: string): MediaQueryList => {
            const real = matchMedia(query);
            if (!standalone.test(query)) {
              return real;
            }
            const fixed = (value: unknown): PropertyDescriptor => ({ value, enumerable: true });
            return Object.create(Object.getPrototypeOf(real) as object, {
              matches: fixed(true),
              media: fixed(real.media),
              onchange: { value: null, writable: true },
              addListener: fixed(() => undefined),
              removeListener: fixed(() => undefined),
              addEventListener: fixed(() => undefined),
              removeEventListener: fixed(() => undefined),
              dispatchEvent: fixed(() => false),
            }) as MediaQueryList;
          };
          Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
        });
      }
      await use();
    },
    { auto: true },
  ],

  swReady: async ({ page }, use) => {
    await use(async () => {
      if (!(await waitForController(page))) {
        await page.reload();
        expect(
          await waitForController(page),
          'the service worker controls the page after one reload',
        ).toBe(true);
      }
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
            entries.push({ cache: name, url: new URL(request.url).pathname });
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
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await cdp.detach();
  },
});

export { expect };
