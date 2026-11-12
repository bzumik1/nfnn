import { Page, Request } from '@playwright/test';
import { expect, pwaTest as test } from './pwa-fixtures';
import { MARKER, SERVICE_WORKER, SERVICE_WORKER_MANIFEST } from './pwa-site';
import { waitWhileNothingMayHappen } from '../fixed-waits';

const POLICY = '/zasady-ochrany-osobnich-udaju';

function privacyLinkOfContact(page: Page) {
  return page
    .locator('#kontakt .contact-legal')
    .getByRole('link', { name: 'zásady ochrany osobních údajů' });
}
const APP_API_UNREACHABLE =
  /^Failed to load resource: the server responded with a status of 504 \(Gateway Timeout\) \(http:\/\/localhost:\d+\/api\//;
const APP_API_OFFLINE =
  /^Failed to load resource: (?:the server responded with a status of 504 \(Gateway Timeout\)|net::ERR_INTERNET_DISCONNECTED) \(http:\/\/localhost:\d+\/api\//;
const CONNECTIVITY_PROBE_WHILE_OFFLINE =
  /^Failed to load resource: net::ERR_INTERNET_DISCONNECTED \(http:\/\/localhost:\d+\/api\/operations\/setup\)$/;
const UNKNOWN_ADDRESS_NOT_FOUND =
  /^console error: Failed to load resource: the server responded with a status of 404 \(Not Found\) \(http:\/\/localhost:\d+\/neexistuje\)$/;
const ANSWER_TIMEOUT_MS = 10_000;
const SETTLE_MS = 1_000;
const CANARY = 'Zxqv Kanárek 7781,77 Kč';
const PUBLIC_ANSWERS = [
  /^\/api\/content\/home$/,
  /^\/api\/content\/news(?:\?[^/]*|\/[^/]*)?$/,
  /^\/api\/content\/projects(?:\?[^/]*|\/[^/]*)?$/,
  /^\/api\/content\/media\/[^/]*$/,
  /^\/api\/donations\/payment-details$/,
];

interface UpdateCheck {
  readonly result?: boolean;
  readonly error?: string;
}

async function checkForUpdate(page: Page): Promise<UpdateCheck> {
  return page.evaluate(
    (timeoutMs) =>
      new Promise<UpdateCheck>((resolve, reject) => {
        const controller = navigator.serviceWorker.controller;
        if (controller === null) {
          reject(new Error('no service worker controls the page'));
          return;
        }
        const nonce = Math.floor(Math.random() * 1_000_000_000);
        const timer = setTimeout(
          () => reject(new Error('the service worker did not finish its update check in time')),
          timeoutMs,
        );
        const answered = (event: MessageEvent): void => {
          const data = event.data as { type?: string; nonce?: number } & UpdateCheck;
          if (data.type === 'OPERATION_COMPLETED' && data.nonce === nonce) {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('message', answered);
            resolve(data.error === undefined ? { result: data.result } : { error: data.error });
          }
        };
        navigator.serviceWorker.addEventListener('message', answered);
        controller.postMessage({ action: 'CHECK_FOR_UPDATES', nonce });
      }),
    ANSWER_TIMEOUT_MS,
  );
}

async function marker(page: Page): Promise<string> {
  return page.evaluate(async (path) => (await (await fetch(path)).text()).trim(), MARKER);
}

async function markThisDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.dataset['pwaSameDocument'] = 'yes';
  });
}

async function sameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.dataset['pwaSameDocument'] === 'yes');
}

async function cachedBodiesHolding(page: Page, text: string): Promise<readonly string[]> {
  return page.evaluate(async (wanted) => {
    const found: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (response !== undefined && (await response.text()).includes(wanted)) {
          found.push(new URL(request.url).pathname);
        }
      }
    }
    return found;
  }, text);
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

  test('when the service worker files and the web app manifest are asked for, then each must be revalidated, Cloudflare keeps no copy of the worker files and the manifest opens /aplikace standalone', async ({
    request,
  }) => {
    for (const path of [SERVICE_WORKER, SERVICE_WORKER_MANIFEST, '/manifest.webmanifest']) {
      const answer = await request.get(path);
      expect(answer.status(), path).toBe(200);
      expect(answer.headers()['cache-control'], path).toBe('no-cache');
    }
    for (const path of [SERVICE_WORKER, SERVICE_WORKER_MANIFEST]) {
      const answer = await request.get(path);
      expect(answer.headers()['cloudflare-cdn-cache-control'], path).toBe('no-store');
    }
    const manifest = await request.get('/manifest.webmanifest');

    expect(manifest.headers()['content-type']).toContain('application/manifest+json');
    expect(await manifest.json()).toMatchObject({
      id: '/aplikace',
      start_url: '/aplikace',
      scope: '/',
      display: 'standalone',
    });
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

  test('when an address the site does not know is opened, then nginx answers 404 with the app under the production headers and the app shows its not-found page', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(UNKNOWN_ADDRESS_NOT_FOUND);
    const response = await page.goto('/neexistuje');

    expect(response?.status()).toBe(404);
    expect(response?.headers()['content-type']).toBe('text/html; charset=utf-8');
    expect(response?.headers()['cache-control']).toBe('no-cache');
    expect(response?.headers()['cloudflare-cdn-cache-control']).toBe('no-store');
    expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tuhle stránku jsme nenašli' }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  test('when the web app manifest and the other text files are asked for, then nginx names UTF-8 for each, so the Czech names read right', async ({
    request,
  }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.headers()['content-type']).toBe('application/manifest+json; charset=utf-8');
    expect(await manifest.json()).toMatchObject({ name: 'Nová naděje – nadační fond' });

    const shell = await request.get('/');
    const styles = /href="(\/?styles-[A-Za-z0-9_-]{8}\.css)"/.exec(await shell.text())?.[1] ?? '';
    expect(styles).not.toBe('');
    for (const path of [
      '/',
      `/${styles.replace(/^\//, '')}`,
      SERVICE_WORKER,
      SERVICE_WORKER_MANIFEST,
      '/boot-guard.js',
      '/favicon.svg',
      '/robots.txt',
      '/sitemap.xml',
    ]) {
      const answer = await request.get(path);
      expect(answer.status(), path).toBe(200);
      expect(answer.headers()['content-type'], path).toMatch(/; charset=utf-8$/);
    }
  });
});

test.describe('Given the app registered its own service worker', () => {
  test.beforeEach(async ({ page, swReady }) => {
    await page.goto('/');
    await swReady();
  });

  test('when the page settles, then the worker controls it from /ngsw-worker.js', async ({
    swReady,
  }) => {
    expect(await swReady()).toEqual({
      scriptURL: expect.stringMatching(/\/ngsw-worker\.js$/),
      state: 'activated',
    });
  });

  test('when an address the site does not know is opened, then the worker answers with the app, keeps no copy of the address and the not-found page shows', async ({
    page,
    cacheDump,
  }) => {
    const response = await page.goto('/neexistuje');

    expect(response?.fromServiceWorker()).toBe(true);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tuhle stránku jsme nenašli' }),
    ).toBeVisible();
    expect((await cacheDump()).map((entry) => entry.url)).not.toContain('/neexistuje');
  });

  test('when the page reads public news and a donor reads their own gifts, then the worker asks the network itself and Cache Storage keeps only the public answers', async ({
    page,
    context,
    cacheDump,
  }) => {
    const askedByWorker: Request[] = [];
    await context.route('**/api/content/news?*', (route) => {
      if (route.request().serviceWorker() !== null) {
        askedByWorker.push(route.request());
      }
      return route.fulfill({ json: { items: [], page: 0, size: 6, total: 0 } });
    });
    await context.route('**/api/donations/me/summary', (route) =>
      route.fulfill({ json: { donor: CANARY } }),
    );

    const donorAnswer = await page.evaluate(async () => {
      await fetch('/api/content/news?page=0&size=6');
      const answer = await fetch('/api/donations/me/summary', {
        headers: { Authorization: 'Bearer not-a-real-token' },
      });
      return answer.json();
    });

    expect(askedByWorker).toHaveLength(1);
    expect(donorAnswer).toEqual({ donor: CANARY });
    const urls = (await cacheDump()).map((entry) => entry.url);
    expect(urls).toContain('/index.html');
    expect(urls).toContain('/boot-guard.js');
    expect(urls.some((url) => /^\/main-[A-Za-z0-9_-]{8}\.js$/.test(url))).toBe(true);
    expect(urls).toContain('/api/content/news?page=0&size=6');
    expect(
      urls
        .filter((url) => url.startsWith('/api/'))
        .filter((url) => !PUBLIC_ANSWERS.some((pattern) => pattern.test(url))),
    ).toEqual([]);
    expect(await cachedBodiesHolding(page, CANARY)).toEqual([]);
  });

  test('when only the network is cut, then a route the test registered still answers the request the worker makes for a public answer', async ({
    page,
    context,
  }) => {
    const askedByWorker: Request[] = [];
    await context.route('**/api/content/news?*', (route) => {
      if (route.request().serviceWorker() !== null) {
        askedByWorker.push(route.request());
      }
      return route.fulfill({ json: { routed: 'offline' } });
    });

    await context.setOffline(true);

    expect(
      await page.evaluate(async () => (await fetch('/api/content/news?page=0&size=6')).json()),
    ).toEqual({ routed: 'offline' });
    expect(askedByWorker).toHaveLength(1);
  });

  test.describe(() => {
    test.use({ allowedConsoleErrors: [CONNECTIVITY_PROBE_WHILE_OFFLINE] });

    test('when the browser comes back online, then the worker reaches the network again', async ({
      page,
      context,
      goOffline,
      goOnline,
    }) => {
      await goOffline();
      await goOnline();
      const askedByWorker: Request[] = [];
      await context.route('**/api/content/news?*', (route) => {
        if (route.request().serviceWorker() !== null) {
          askedByWorker.push(route.request());
        }
        return route.fulfill({ json: { back: true } });
      });

      expect(
        await page.evaluate(async () => (await fetch('/api/content/news?page=0&size=6')).json()),
      ).toEqual({ back: true });
      expect(askedByWorker).toHaveLength(1);
    });
  });

  test.describe('when the browser goes offline', () => {
    test.use({ allowedConsoleErrors: [APP_API_OFFLINE] });

    test('then a route never opened renders from the cached app shell', async ({
      page,
      goOffline,
    }) => {
      await goOffline();

      await page.goto(POLICY);

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('then an API answer the worker never keeps fails, and once back online it comes from the server again', async ({
      page,
      context,
      goOffline,
      goOnline,
    }) => {
      let answered = 0;
      await context.route('**/api/donations/me/summary', (route) => {
        answered += 1;
        return route.fulfill({ json: { donor: 'online' } });
      });
      const ask = (): Promise<string> =>
        page.evaluate(async () => {
          try {
            const answer = await fetch('/api/donations/me/summary');
            return answer.ok
              ? ((await answer.json()) as { donor: string }).donor
              : `${answer.status}`;
          } catch {
            return 'unreachable';
          }
        });

      await goOffline();
      expect(await ask()).not.toBe('online');
      expect(answered).toBe(0);

      await goOnline();
      expect(await ask()).toBe('online');
      expect(answered).toBe(1);
    });
  });

  test.describe('when the server cannot be reached', () => {
    test.use({ allowedConsoleErrors: [APP_API_UNREACHABLE] });

    test('then the running version keeps working from the cache', async ({ page, site }) => {
      await site.takeDown();

      await page.goto(POLICY);

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  });

  test('when the server removed every chunk of the running version, then the tab still opens a page it never opened', async ({
    page,
    site,
    request,
  }) => {
    const manifest = (await (await request.get(SERVICE_WORKER_MANIFEST)).json()) as {
      hashTable: Record<string, string>;
    };
    const chunks = Object.keys(manifest.hashTable).filter((path) => path.startsWith('/chunk-'));
    expect(chunks.length).toBeGreaterThan(0);
    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const chunk of chunks) {
      site.remove(chunk);
    }

    await privacyLinkOfContact(page).click();

    await expect(page).toHaveURL(new RegExp(`${POLICY}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('when the operator turns the service worker off, then at its next check the worker removes itself and its caches and the site still opens', async ({
    page,
    site,
    request,
  }) => {
    await site.turnServiceWorkerOff();

    expect((await request.get(SERVICE_WORKER_MANIFEST)).status()).toBe(404);
    expect(await (await request.get(SERVICE_WORKER)).text()).toContain('NGSW Safety Worker');
    await checkForUpdate(page);

    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
      )
      .toBe(0);
    await expect
      .poll(() =>
        page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('ngsw:'))),
      )
      .toEqual([]);
    await page.goto(POLICY);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('Given a visitor who already acted on the page when a new version is deployed', () => {
  test.beforeEach(async ({ page, swReady }) => {
    await page.goto('/o-nas');
    await swReady();
    await page.getByRole('heading', { level: 1 }).click();
  });

  test('when version B is ready while a half-typed message waits on the page, then the message stays, and leaving the page loads B', async ({
    page,
    site,
  }) => {
    expect(await marker(page)).toBe('a');
    await markThisDocument(page);
    const message = page.getByLabel('Vaše zpráva');
    await message.click();
    await message.pressSequentially('Dobrý den, chtěla bych se zeptat');

    site.switchTo('b');
    expect(await checkForUpdate(page)).toEqual({ result: true });
    await waitWhileNothingMayHappen(page, SETTLE_MS);

    await expect(message).toHaveValue('Dobrý den, chtěla bych se zeptat');
    expect(await sameDocument(page)).toBe(true);
    expect(await marker(page)).toBe('a');

    await privacyLinkOfContact(page).click();

    await expect(page).toHaveURL(new RegExp(`${POLICY}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => sameDocument(page)).toBe(false);
    expect(await marker(page)).toBe('b');
  });

  test('when version B is ready and nothing is typed, then a section of the same page opens in place and the next page the visitor opens loads B', async ({
    page,
    site,
  }) => {
    expect(await marker(page)).toBe('a');
    await privacyLinkOfContact(page).click();
    await expect(page).toHaveURL(new RegExp(`${POLICY}$`));
    await markThisDocument(page);

    site.switchTo('b');
    expect(await checkForUpdate(page)).toEqual({ result: true });
    await waitWhileNothingMayHappen(page, SETTLE_MS);
    expect(await sameDocument(page)).toBe(true);

    await page.getByRole('link', { name: 'Jaké údaje zpracováváme a proč', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${POLICY}#udaje$`));
    await waitWhileNothingMayHappen(page, SETTLE_MS);
    expect(await sameDocument(page)).toBe(true);
    expect(await marker(page)).toBe('a');

    await page.getByRole('link', { name: 'kontaktní formulář', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => sameDocument(page)).toBe(false);
    await expect(page).toHaveURL(/\/o-nas#kontakt$/);
    expect(await marker(page)).toBe('b');
  });

  test.describe('when the server no longer has a file of the running version that the tab never kept', () => {
    test.use({
      allowedConsoleErrors: [
        /^Failed to load resource: the server responded with a status of 404 \(Not Found\) \(http:\/\/localhost:\d+\/pwa-marker\.txt\)$/,
      ],
    });

    test('then the app reports it and loads the site again from the server', async ({
      page,
      site,
      context,
    }) => {
      const reports: unknown[] = [];
      await context.route('**/api/operations/client-errors', (route) => {
        reports.push(route.request().postDataJSON());
        return route.fulfill({ status: 204 });
      });
      await page.evaluate(() => fetch('/favicon.svg').then(() => undefined));
      await markThisDocument(page);
      site.remove(MARKER);

      await page.evaluate((path) => {
        void fetch(path).catch(() => undefined);
      }, MARKER);

      await expect.poll(() => sameDocument(page).catch(() => true)).toBe(false);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect
        .poll(() => reports)
        .toContainEqual(
          expect.objectContaining({ kind: 'sw-unrecoverable', place: 'service-worker' }),
        );
    });
  });
});

test.describe('Given a visitor who has not touched the page yet', () => {
  test('when a new version is ready right after the page opened, then the page loads it at once', async ({
    page,
    site,
    swReady,
  }) => {
    await page.goto('/');
    await swReady();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await marker(page)).toBe('a');
    await markThisDocument(page);

    site.switchTo('b');
    await checkForUpdate(page);

    await expect.poll(() => sameDocument(page).catch(() => false)).toBe(false);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await marker(page)).toBe('b');
  });
});
