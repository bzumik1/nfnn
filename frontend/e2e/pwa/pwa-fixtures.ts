import {
  Browser,
  BrowserContext,
  CDPSession,
  expect,
  Page,
  Route,
  test as base,
} from '@playwright/test';
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
  cameraFrame: {
    readonly width: number;
    readonly height: number;
    readonly pixelsPerModule?: number;
  };
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
const PREFETCH_TIMEOUT_MS = 20_000;
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

type RecordProblem = (kind: string, text: string, where: string | undefined) => void;

interface TargetInfo {
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
  readonly browserContextId?: string;
}

interface TargetMessage {
  readonly method?: string;
  readonly params?: {
    readonly entry?: { readonly source: string; readonly level: string; readonly text: string };
    readonly exceptionDetails?: {
      readonly text: string;
      readonly exception?: { readonly description?: string };
    };
  };
}

const WORKER_DOMAINS = ['Runtime.enable', 'Log.enable', 'Runtime.runIfWaitingForDebugger'];

async function watchWorkers(
  context: BrowserContext,
  browser: Browser,
  record: RecordProblem,
): Promise<() => Promise<void>> {
  const sessions: CDPSession[] = [];
  const contexts = new Set<string>();
  const attached = new Set<string>();
  let nextId = 0;
  const listen = (session: CDPSession, kinds: readonly string[], uncaught: boolean): void => {
    const urls = new Map<string, string>();
    session.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      if (!kinds.includes(targetInfo.type)) {
        return;
      }
      urls.set(sessionId, targetInfo.url);
      for (const method of WORKER_DOMAINS) {
        session
          .send('Target.sendMessageToTarget', {
            sessionId,
            message: JSON.stringify({ id: ++nextId, method }),
          })
          .catch(() => undefined);
      }
    });
    session.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
      const where = urls.get(sessionId);
      if (where === undefined) {
        return;
      }
      const received = JSON.parse(message) as TargetMessage;
      const entry = received.params?.entry;
      const thrown = received.params?.exceptionDetails;
      if (received.method === 'Log.entryAdded' && entry?.source === 'security') {
        record('Content-Security-Policy violation', entry.text, where);
      } else if (uncaught && received.method === 'Runtime.exceptionThrown' && thrown) {
        const text = thrown.exception?.description?.split('\n')[0] ?? thrown.text;
        record('uncaught error', text, where);
      }
    });
  };
  const root = await browser.newBrowserCDPSession();
  sessions.push(root);
  listen(root, ['service_worker'], true);
  const attachServiceWorker = (target: TargetInfo): void => {
    if (
      target.type === 'service_worker' &&
      target.browserContextId !== undefined &&
      contexts.has(target.browserContextId) &&
      !attached.has(target.targetId)
    ) {
      attached.add(target.targetId);
      root
        .send('Target.attachToTarget', { targetId: target.targetId, flatten: false })
        .catch(() => undefined);
    }
  };
  root.on('Target.targetCreated', ({ targetInfo }) => attachServiceWorker(targetInfo));
  const watchPage = async (page: Page): Promise<void> => {
    const session = await context.newCDPSession(page);
    sessions.push(session);
    const { targetInfo } = await session.send('Target.getTargetInfo');
    if (targetInfo.browserContextId !== undefined) {
      contexts.add(targetInfo.browserContextId);
    }
    listen(session, ['worker', 'shared_worker'], false);
    await session.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: false,
    });
    const { targetInfos } = await root.send('Target.getTargets');
    targetInfos.forEach(attachServiceWorker);
  };
  const watching: Promise<void>[] = [];
  context.on('page', (page) => {
    watching.push(watchPage(page).catch(() => undefined));
  });
  await Promise.all(context.pages().map(watchPage));
  await root.send('Target.setDiscoverTargets', { discover: true });
  return async () => {
    await Promise.all(watching);
    await Promise.all(sessions.map((session) => session.detach().catch(() => undefined)));
  };
}

async function prefetched(page: Page): Promise<void> {
  const answer = await page.request.get('/ngsw.json');
  if (!answer.ok()) {
    return;
  }
  const manifest = (await answer.json()) as {
    assetGroups: readonly { installMode: string; urls: readonly string[] }[];
  };
  const wanted = manifest.assetGroups
    .filter((group) => group.installMode === 'prefetch')
    .flatMap((group) => group.urls);
  await expect
    .poll(
      () =>
        page.evaluate(async (urls) => {
          const cached = new Set<string>();
          for (const name of await caches.keys()) {
            for (const request of await (await caches.open(name)).keys()) {
              cached.add(new URL(request.url).pathname);
            }
          }
          return urls.filter((url) => !cached.has(url));
        }, wanted),
      {
        message: 'the service worker keeps every prefetched file of its version in Cache Storage',
        timeout: PREFETCH_TIMEOUT_MS,
      },
    )
    .toEqual([]);
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
  cameraFrame: [
    { width: 640, height: 480 },
    { option: true, scope: 'worker' },
  ],
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
    async ({ launchOptions, cameraShows, cameraFrame }, use) => {
      if (cameraShows === undefined) {
        await use(launchOptions);
        return;
      }
      const folder = mkdtempSync(join(tmpdir(), 'nfnn-pwa-camera-'));
      const video = join(folder, 'camera.y4m');
      writeFileSync(
        video,
        qrCodeY4m(cameraShows, cameraFrame.width, cameraFrame.height, cameraFrame.pixelsPerModule),
      );
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
    async ({ context, browser, allowedConsoleErrors }, use) => {
      const problems: string[] = [];
      const expected: RegExp[] = [];
      const record: RecordProblem = (kind, text, where) => {
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
      const stopWatchingWorkers = await watchWorkers(context, browser, record);
      await use({ expectOne: (pattern) => expected.push(pattern) });
      try {
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
      } finally {
        await stopWatchingWorkers();
      }
      expect(
        problems,
        'no page or service worker of the installed web app logs a console error, and no page or worker throws an uncaught error or violates a Content-Security-Policy directive',
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
      await prefetched(page);
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
