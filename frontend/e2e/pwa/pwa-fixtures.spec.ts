import { Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { expect, pwaTest as test } from './pwa-fixtures';
import { serveReceiptKeys } from '../receipt-verification';
import {
  MARKER,
  PLANTED_DEDICATED_WORKER,
  PLANTED_SCOPE,
  PLANTED_WORKER,
  startPwaSite,
} from './pwa-site';

const POLICY = '/zasady-ochrany-osobnich-udaju';
const HOST_LINKS = '/sys/class/net';

function hostLinks(): readonly string[] {
  return readdirSync(HOST_LINKS).sort();
}

interface ScriptUrlPolicies {
  readonly defaultPolicy: unknown;
  createPolicy(name: string, rules: { createScriptURL(input: string): string }): unknown;
}

async function openMarkerAdmittingPlantedScripts(page: Page): Promise<void> {
  await page.goto(MARKER);
  await page.evaluate(() => {
    const policies = (window as unknown as { trustedTypes?: ScriptUrlPolicies }).trustedTypes;
    if (policies !== undefined && !policies.defaultPolicy) {
      policies.createPolicy('default', { createScriptURL: (input) => input });
    }
  });
}

async function tellPlantedServiceWorker(page: Page, message: string): Promise<void> {
  await openMarkerAdmittingPlantedScripts(page);
  await page.evaluate(
    async ({ script, scope, sent }) => {
      const registration = await navigator.serviceWorker.register(script, {
        scope,
      });
      const worker =
        registration.active ??
        (await new Promise<ServiceWorker>((activated) => {
          const installing = registration.installing ?? registration.waiting;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'activated') {
              activated(installing);
            }
          });
        }));
      worker.postMessage(sent);
    },
    { script: PLANTED_WORKER, scope: PLANTED_SCOPE, sent: message },
  );
}

async function openPolicy(page: Page): Promise<void> {
  await page.goto(POLICY);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('Given the pwaTest fixture watching a page of the production build', () => {
  test('when the page logs a console error, then the test fails', async ({ page }) => {
    test.fail(true, 'planted: a console error must fail the test');
    await openPolicy(page);

    const logged = page.waitForEvent('console');
    await page.evaluate(() => console.error('planted console error'));
    await logged;
  });

  test('when an error escapes a page, then the fixture records it as uncaught with the page address', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(
      /^uncaught error: planted uncaught error \(http:\/\/localhost:\d+\/pwa-marker\.txt\)$/,
    );
    await page.goto(MARKER);

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('planted uncaught error');
      });
    });
  });

  test('when an inline script is added to the page, then the fixture records the Content-Security-Policy violation and the refusal the browser logs', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(
      /^Content-Security-Policy violation: require-trusted-types-for blocked trusted-types-sink \(http:\/\/localhost:\d+\/zasady-ochrany-osobnich-udaju\)$/,
    );
    browserProblems.expectOne(/^console error: This document requires 'TrustedScript' assignment/);
    await openPolicy(page);

    await page.evaluate(() => {
      const script = document.createElement('script');
      try {
        script.textContent = 'window.planted = true;';
      } catch {
        return;
      }
      document.body.append(script);
    });
  });

  test('when a service worker logs a console error, then the fixture records it', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(/^console error: pwa planted worker error/);
    await tellPlantedServiceWorker(page, 'log-error');
  });

  test('when a service worker throws, then the fixture records the uncaught error with the worker address', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(
      /^uncaught error: Error: pwa planted worker failure \(http:\/\/localhost:\d+\/pwa-plant-sw\.js\)$/,
    );
    await tellPlantedServiceWorker(page, 'throw');
  });

  test('when a service worker reaches another site, then the fixture records the Content-Security-Policy violation with the worker address', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(
      /^Content-Security-Policy violation: Connecting to 'https:\/\/example\.com\/pwa-plant' violates .*connect-src 'self'.* \(http:\/\/localhost:\d+\/pwa-plant-sw\.js\)$/,
    );
    await tellPlantedServiceWorker(page, 'violate');
  });

  test('when a dedicated worker reaches another site, then the fixture records the Content-Security-Policy violation with the worker address', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(
      /^Content-Security-Policy violation: Connecting to 'https:\/\/example\.com\/pwa-plant' violates .*connect-src 'self'.* \(http:\/\/localhost:\d+\/pwa-plant-worker\.js\)$/,
    );
    await openMarkerAdmittingPlantedScripts(page);

    await page.evaluate((script) => {
      const worker = new Worker(script);
      worker.postMessage('violate');
    }, PLANTED_DEDICATED_WORKER);
  });

  test('when an expected problem never happens, then the test fails', async ({
    page,
    browserProblems,
  }) => {
    test.fail(true, 'planted: an expected problem that never comes must fail the test');
    browserProblems.expectOne(/^console error: never logged$/);
    await openPolicy(page);
  });

  test('when a spec routes on the page, directly or through a shared helper, then the fixture refuses it', async ({
    page,
  }) => {
    const routeOnThePage = page.route.bind(page);

    await expect(routeOnThePage('**/api/x', (route) => route.abort())).rejects.toThrow(
      /route on the context/,
    );
    await expect(serveReceiptKeys(page)).rejects.toThrow(/route on the context/);
  });

  test.describe('when the test allows a console error by its text', () => {
    test.use({ allowedConsoleErrors: [/^allowed console error$/] });

    test('then that error passes and the page still renders', async ({ page }) => {
      await openPolicy(page);

      await page.evaluate(() => console.error('allowed console error'));
    });
  });
});

test.describe('Given a page outside the app that stored data in the browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MARKER);
    await page.evaluate(async () => {
      window.localStorage.setItem('nfnn.local', 'kept');
      window.sessionStorage.setItem('nfnn.session', 'tab');
      document.cookie = 'nfnn-probe=1; path=/';
      await caches.open('nfnn-probe-cache').then((cache) => cache.put('/probe', new Response('x')));
      await new Promise<void>((resolve, reject) => {
        const opened = indexedDB.open('nfnn-probe', 1);
        opened.onupgradeneeded = () => opened.result.createObjectStore('records');
        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const transaction = opened.result.transaction('records', 'readwrite');
          transaction.objectStore('records').put({ id: 7, note: 'probe' }, 'first');
          transaction.oncomplete = () => {
            opened.result.close();
            resolve();
          };
        };
      });
    });
  });

  test('when the storage is dumped, then every kind of browser storage is listed by name', async ({
    storageDump,
  }) => {
    expect(await storageDump()).toEqual({
      localStorage: expect.objectContaining({ 'nfnn.local': 'kept' }),
      sessionStorage: { 'nfnn.session': 'tab' },
      cookies: ['nfnn-probe'],
      databases: ['nfnn-probe'],
      caches: ['nfnn-probe-cache'],
    });
  });

  test('when IndexedDB is dumped, then each store lists its records', async ({ idbDump }) => {
    expect(await idbDump()).toEqual({ 'nfnn-probe': { records: [{ id: 7, note: 'probe' }] } });
  });

  test('when the cache is dumped, then each cached request is listed by its cache and path', async ({
    cacheDump,
  }) => {
    expect(await cacheDump()).toEqual([{ cache: 'nfnn-probe-cache', url: '/probe' }]);
  });
});

test.describe('Given the host the browsers of every worker run on', () => {
  test.skip(
    !existsSync(HOST_LINKS),
    'Docker Desktop runs the containers in a virtual machine, so no link of theirs reaches the host the browser runs on',
  );

  test('when a site starts, goes down, comes back and is removed, then the host gains and loses no network link, so a browser loading a page never sees its network change', async ({
    pwaDist,
  }) => {
    const before = hostLinks();
    const site = await startPwaSite(pwaDist);
    try {
      expect(hostLinks()).toEqual(before);
      await site.takeDown();
      expect(hostLinks()).toEqual(before);
      await site.bringUp();
      expect(hostLinks()).toEqual(before);
    } finally {
      await site.dispose();
    }
    expect(hostLinks()).toEqual(before);
  });
});
