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

const notBuilt = (what: string): never => {
  throw new Error(`pwaTest: ${what} is not built yet`);
};

export const pwaTest = base.extend<PwaFixtures & PwaOptions, PwaWorkerFixtures & PwaWorkerOptions>({
  displayMode: ['browser', { option: true }],
  allowedConsoleErrors: [[], { option: true }],
  cameraShows: [undefined, { option: true, scope: 'worker' }],
  pwaDist: [builtDist(), { option: true, scope: 'worker' }],
  pwaSite: [async ({ pwaDist }, use) => use(await startPwaSite(pwaDist)), { scope: 'worker' }],
  site: [async ({ pwaSite }, use) => use(pwaSite), { auto: true }],
  pwaApi: [async ({}, use) => use(), { auto: true }],
  browserProblems: [async ({}, use) => use(), { auto: true }],
  standaloneStub: [async ({}, use) => use(), { auto: true }],
  swReady: async ({}, use) => use(async () => notBuilt('swReady')),
  goOffline: async ({}, use) => use(async () => notBuilt('goOffline')),
  goOnline: async ({}, use) => use(async () => notBuilt('goOnline')),
  idbDump: async ({}, use) => use(async () => notBuilt('idbDump')),
  cacheDump: async ({}, use) => use(async () => notBuilt('cacheDump')),
  storageDump: async ({}, use) => use(async () => notBuilt('storageDump')),
  virtualAuthenticator: async ({}, use) => use(notBuilt('virtualAuthenticator')),
});

export { expect };
