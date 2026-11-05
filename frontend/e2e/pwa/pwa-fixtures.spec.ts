import { Page } from '@playwright/test';
import { expect, pwaTest as test } from './pwa-fixtures';
import { PROBE_WORKER } from './pwa-site';

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

  test('when an error escapes the page, then the test fails', async ({ page }) => {
    test.fail(true, 'planted: an uncaught error must fail the test');
    await page.route('/api/operations/client-errors', (route) => route.fulfill({ status: 204 }));
    await openPolicy(page);

    const thrown = page.waitForEvent('console', (message) => message.type() === 'error');
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('planted uncaught error');
      });
    });
    await thrown;
  });

  test('when an inline script is added to the page, then the Content-Security-Policy refuses it and the test fails', async ({
    page,
  }) => {
    test.fail(true, 'planted: a Content-Security-Policy violation must fail the test');
    await openPolicy(page);

    const refused = page.waitForEvent('console', (message) => message.type() === 'error');
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.planted = true;';
      document.body.append(script);
    });
    await refused;
  });

  test('when a service worker logs a console error, then the test fails', async ({
    page,
    context,
    swReady,
  }) => {
    test.fail(true, 'planted: a console error of the service worker must fail the test');
    await openPolicy(page);
    await page.evaluate((script) => navigator.serviceWorker.register(script), PROBE_WORKER);
    await swReady();

    const logged = context.waitForEvent('console', (message) => message.type() === 'error');
    await page.evaluate(() => navigator.serviceWorker.controller?.postMessage('log-error'));
    await logged;
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
