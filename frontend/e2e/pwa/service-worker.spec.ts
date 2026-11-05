import { Page, Request } from '@playwright/test';
import { expect, pwaTest as test } from './pwa-fixtures';
import { MARKER, PROBE_MANIFEST, PROBE_WORKER } from './pwa-site';

const POLICY = '/zasady-ochrany-osobnich-udaju';
const APP_API_OFFLINE = /^Failed to load resource: net::ERR_FAILED \(http:\/\/localhost:\d+\/api\//;

async function registerProbeWorker(page: Page): Promise<void> {
  await page.evaluate(async (script) => {
    await navigator.serviceWorker.register(script, { scope: '/' });
  }, PROBE_WORKER);
}

const ANSWER_TIMEOUT_MS = 5_000;
const UPDATE_TIMEOUT_MS = 10_000;

async function askWorker(page: Page, message: unknown): Promise<unknown> {
  return page.evaluate(
    ({ sent, timeoutMs }) =>
      new Promise((resolve, reject) => {
        const controller = navigator.serviceWorker.controller;
        if (controller === null) {
          reject(new Error('no service worker controls the page'));
          return;
        }
        const channel = new MessageChannel();
        const timer = setTimeout(
          () => reject(new Error(`the worker did not answer ${JSON.stringify(sent)} in time`)),
          timeoutMs,
        );
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          resolve(event.data);
        };
        controller.postMessage(sent, [channel.port2]);
      }),
    { sent: message, timeoutMs: ANSWER_TIMEOUT_MS },
  );
}

async function waitingVersion(page: Page): Promise<string> {
  return page.evaluate(
    async ({ answerMs, updateMs }) => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration === undefined) {
        throw new Error('no registration');
      }
      await registration.update();
      const waiting = await new Promise<ServiceWorker>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('no update of the worker was waiting in time')),
          updateMs,
        );
        const settled = (): void => {
          if (registration.waiting !== null) {
            clearTimeout(timer);
            resolve(registration.waiting);
          }
        };
        settled();
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', settled);
        });
        registration.installing?.addEventListener('statechange', settled);
      });
      return new Promise<string>((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(
          () => reject(new Error('the waiting worker did not tell its version in time')),
          answerMs,
        );
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          resolve((event.data as { version: string }).version);
        };
        waiting.postMessage('version', [channel.port2]);
      });
    },
    { answerMs: ANSWER_TIMEOUT_MS, updateMs: UPDATE_TIMEOUT_MS },
  );
}

async function marker(page: Page): Promise<string> {
  return page.evaluate(async (path) => (await (await fetch(path)).text()).trim(), MARKER);
}

test.describe('Given the production build served by the real nginx', () => {
  test('when the home page opens, then it carries the production headers and renders without a browser problem', async ({
    page,
  }) => {
    const response = await page.goto('/');

    expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
    expect(response?.headers()['cache-control']).toBe('no-cache');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('when a removed hashed chunk is asked for, then nginx answers 404 instead of the app page', async ({
    page,
    site,
  }) => {
    await page.goto('/');
    const chunk = await page.evaluate(
      () =>
        performance
          .getEntriesByType('resource')
          .map((entry) => new URL(entry.name).pathname)
          .find((path) => /^\/chunk-[A-Za-z0-9_-]{8}\.js$/.test(path)) ?? '',
    );
    expect(chunk).not.toBe('');

    site.remove(chunk);

    expect((await page.request.get(chunk)).status()).toBe(404);
  });
});

test.describe('Given a page that registered the throwaway probe worker', () => {
  test.beforeEach(async ({ page, swReady }) => {
    await page.goto('/');
    await registerProbeWorker(page);
    await swReady();
  });

  test('when the page settles, then the worker controls it from its own script', async ({
    swReady,
  }) => {
    expect(await swReady()).toEqual({
      scriptURL: expect.stringMatching(/\/ngsw-worker\.js$/),
      state: 'activated',
    });
  });

  test('when the worker itself fetches an API path, then the context route answers it and sees the worker as its sender', async ({
    page,
    context,
  }) => {
    const fromWorker: Request[] = [];
    await context.route('**/api/content/news', (route) => {
      if (route.request().serviceWorker() !== null) {
        fromWorker.push(route.request());
      }
      return route.fulfill({ json: { items: ['mocked for the worker'] } });
    });

    const answer = await askWorker(page, { fetch: '/api/content/news' });

    expect(answer).toEqual({ status: 200, body: '{"items":["mocked for the worker"]}' });
    expect(fromWorker).toHaveLength(1);
  });

  test('when the page fetches an API path through the worker, then the context route answers it', async ({
    page,
    context,
  }) => {
    await context.route('**/api/content/news', (route) =>
      route.fulfill({ json: { items: ['mocked through the worker'] } }),
    );

    const body = await page.evaluate(async () => (await fetch('/api/content/news')).json());

    expect(body).toEqual({ items: ['mocked through the worker'] });
  });

  test.describe('when the browser goes offline', () => {
    test.use({ allowedConsoleErrors: [APP_API_OFFLINE] });

    test('then a route never opened renders from the cached app shell, and the worker reaches neither a mocked API path nor the server', async ({
      page,
      goOffline,
    }) => {
      await goOffline();

      await page.goto(POLICY);

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await askWorker(page, { fetch: '/api/content/news' })).toEqual({
        failed: expect.stringContaining('TypeError'),
      });
      expect(await askWorker(page, { fetch: PROBE_MANIFEST })).toEqual({
        failed: expect.stringContaining('TypeError'),
      });
    });

    test('then the network cut alone keeps the worker from the server, while a route the test registered still answers it', async ({
      page,
      context,
    }) => {
      await context.route('**/api/content/news', (route) =>
        route.fulfill({ json: { routed: 'offline' } }),
      );

      await context.setOffline(true);

      expect(await askWorker(page, { fetch: PROBE_MANIFEST })).toEqual({
        failed: expect.stringContaining('TypeError'),
      });
      expect(await askWorker(page, { fetch: '/api/content/news' })).toEqual({
        status: 200,
        body: '{"routed":"offline"}',
      });
    });
  });

  test('when the browser comes back online, then the worker reaches the network again', async ({
    page,
    goOffline,
    goOnline,
    context,
  }) => {
    await context.route('**/api/content/news', (route) => route.fulfill({ json: { back: true } }));
    await goOffline();
    await goOnline();

    expect(await askWorker(page, { fetch: '/api/content/news' })).toEqual({
      status: 200,
      body: '{"back":true}',
    });
  });

  test('when the cache is dumped, then it holds the app shell and the marker and no API answer', async ({
    page,
    cacheDump,
  }) => {
    await page.evaluate(async () => fetch('/api/content/home'));

    const urls = (await cacheDump()).map((entry) => entry.url);

    expect(urls).toContain('/index.html');
    expect(urls).toContain(MARKER);
    expect(urls.some((url) => /^\/main-[A-Za-z0-9_-]{8}\.js$/.test(url))).toBe(true);
    expect(urls.filter((url) => url.startsWith('/api/'))).toEqual([]);
  });

  test('when the server switches to variant B, then the worker finds the update and B waits with another version', async ({
    page,
    site,
  }) => {
    const current = (await askWorker(page, 'version')) as { version: string };
    expect(await marker(page)).toBe('a');

    site.switchTo('b');

    const waiting = await waitingVersion(page);
    expect(waiting).not.toBe(current.version);
    expect(site.filesOnlyIn('b')).toEqual([
      '/ngsw-worker.js',
      '/pwa-marker.txt',
      '/pwa-probe.json',
    ]);
    expect(await marker(page)).toBe('a');
  });

  test('when the waiting variant B takes over, then the page reloads into B', async ({
    page,
    site,
    swReady,
  }) => {
    site.switchTo('b');
    const version = await waitingVersion(page);

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const changed = new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
      registration?.waiting?.postMessage('skip-waiting');
      await changed;
      const controller = navigator.serviceWorker.controller;
      if (controller !== null && controller.state !== 'activated') {
        await new Promise<void>((activated) =>
          controller.addEventListener('statechange', () => {
            if (controller.state === 'activated') {
              activated();
            }
          }),
        );
      }
    });
    await page.reload();
    await swReady();

    expect(await askWorker(page, 'version')).toEqual({ version });
    expect(await marker(page)).toBe('b');
  });

  test('when the server cannot be reached, then the running variant keeps working from the cache', async ({
    page,
    site,
  }) => {
    await site.takeDown();

    await page.goto(POLICY);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await marker(page)).toBe('a');
  });
});
