import type { BrowserContext, Page } from '@playwright/test';
import { FOUNDATION_PAYMENT_DETAILS } from '../qr-matrices';
import { expect, pwaTest as test } from './pwa-fixtures';

const REQUESTS_THAT_REACH_NOTHING =
  /^(?:Failed to load resource: .*|Error: Response not Ok \(fetchAndCacheOnce\): .*) \(http:\/\/localhost:\d+\/(?:api\/|images\/|ngsw-worker\.js).*\)$/;
const SHOWN_WITHIN = { timeout: 4_000 };
const KEPT_MINUTES_AGO = () => new Date(Date.now() - 10 * 60_000).toUTCString();

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  live: true,
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
  signer: null,
};

const project = {
  id: '0199f3e0-0000-7000-8000-00000000c002',
  slug: 'dominik-7-let',
  title: 'Dominik, 7 let',
  year: 2024,
  tag: 'Kompenzační pomůcky',
  perex: 'Pomohli jsme mu získat speciální kočárek.',
  body: 'Dominik se narodil s dětskou mozkovou obrnou.',
  coverImage: null,
  publishedOn: '2026-10-01',
  createdAt: '2026-09-19T09:00:00Z',
  updatedAt: '2026-10-01T07:30:00Z',
};

const list = <T>(items: T[]) => ({ items, page: 0, size: 50, total: items.length, hasMore: false });

async function servePublishedContent(context: BrowserContext): Promise<void> {
  const answers: Record<string, unknown> = {
    '/api/content/home': { news: [article], projects: [project] },
    '/api/content/news': list([article]),
    '/api/content/projects': list([project]),
    [`/api/content/news/${article.slug}`]: article,
    [`/api/content/projects/${project.slug}`]: project,
    '/api/donations/payment-details': FOUNDATION_PAYMENT_DETAILS,
  };
  await context.route(
    (url) => url.pathname in answers,
    (route) =>
      route.fulfill({
        json: answers[new URL(route.request().url()).pathname],
        headers: { Date: KEPT_MINUTES_AGO() },
      }),
  );
}

const PAGES: readonly { path: string; shows: (page: Page) => ReturnType<Page['getByRole']> }[] = [
  { path: '/o-nas', shows: (page) => page.getByRole('heading', { level: 1 }) },
  {
    path: '/aktuality',
    shows: (page) => page.getByRole('heading', { name: article.title }),
  },
  {
    path: `/aktuality/${article.slug}`,
    shows: (page) => page.getByRole('heading', { level: 1, name: article.title }),
  },
  { path: '/projekty', shows: (page) => page.getByRole('heading', { name: project.title }) },
  {
    path: '/projekty?rok=2024',
    shows: (page) => page.getByRole('heading', { name: project.title }),
  },
  {
    path: `/projekty/${project.slug}`,
    shows: (page) => page.getByRole('heading', { level: 1, name: project.title }),
  },
  { path: '/prispet', shows: (page) => page.locator('#prispet .qr-code svg[role="img"]') },
];

async function visitEveryPage(page: Page): Promise<void> {
  for (const { path, shows } of PAGES) {
    await page.goto(path);
    await expect(shows(page)).toBeVisible();
  }
}

async function nothingLoadsForever(page: Page): Promise<void> {
  await expect(page.getByText(/^Načítáme/)).toHaveCount(0, SHOWN_WITHIN);
}

test.describe('Given a visitor who opened every public page once with a connection', () => {
  test.use({ allowedConsoleErrors: [REQUESTS_THAT_REACH_NOTHING] });

  test.beforeEach(async ({ page, context, swReady }) => {
    await servePublishedContent(context);
    await page.goto('/');
    await swReady();
    await visitEveryPage(page);
  });

  test('when the network leaves every request hanging while the browser still says online (a phone in airplane mode), then every page shows what it kept and none waits on the network', async ({
    page,
    context,
  }) => {
    await context.route('**/api/**', () => new Promise<void>(() => undefined));

    for (const { path, shows } of PAGES) {
      await page.goto(path);
      await expect(shows(page), path).toBeVisible(SHOWN_WITHIN);
      await nothingLoadsForever(page);
    }
  });

  test.describe('when the connection is gone', () => {
    test.beforeEach(async ({ goOffline }) => {
      await goOffline();
    });

    test('then every page shows what it kept, and none waits on the network', async ({ page }) => {
      for (const { path, shows } of PAGES) {
        await page.goto(path);
        await expect(shows(page), path).toBeVisible(SHOWN_WITHIN);
        await nothingLoadsForever(page);
      }
    });

    test('then a story the device never opened says it could not be loaded and offers to try again instead of loading for ever', async ({
      page,
    }) => {
      await page.goto('/projekty');
      await expect(page.getByRole('heading', { name: project.title })).toBeVisible();

      await page.goto('/projekty/jiny-pribeh');

      await expect(page.getByText('Stránku se nepodařilo načíst.')).toBeVisible(SHOWN_WITHIN);
      await expect(page.getByRole('button', { name: 'Zkusit znovu' })).toBeVisible();
      await nothingLoadsForever(page);
    });
  });
});
