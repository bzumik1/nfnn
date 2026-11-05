import { Page } from '@playwright/test';
import { expect, pwaTest as test } from './pwa-fixtures';
import { serveReceiptKeys } from '../receipt-verification';
import { MARKER, PROBE_WORKER } from './pwa-site';

const POLICY = '/zasady-ochrany-osobnich-udaju';

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
      /^Content-Security-Policy violation: script-src-elem blocked inline \(http:\/\/localhost:\d+\/zasady-ochrany-osobnich-udaju\)$/,
    );
    browserProblems.expectOne(/^console error: Executing inline script violates/);
    await openPolicy(page);

    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.planted = true;';
      document.body.append(script);
    });
  });

  test('when a service worker logs a console error, then the fixture records it', async ({
    page,
    swReady,
    browserProblems,
  }) => {
    browserProblems.expectOne(/^console error: pwa probe worker error [0-9a-f]{16}/);
    await openPolicy(page);
    await page.evaluate((script) => navigator.serviceWorker.register(script), PROBE_WORKER);
    await swReady();

    await page.evaluate(() => navigator.serviceWorker.controller?.postMessage('log-error'));
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

test.describe('Given a page that stored data in the browser', () => {
  test.beforeEach(async ({ page }) => {
    await openPolicy(page);
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
