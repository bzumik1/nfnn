import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';
import { requestsInFlight, settled } from './settled';

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c101',
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

interface HeldNews {
  release(): void;
  readonly asked: () => number;
}

async function newsAnsweredOnceThenHeld(page: Page): Promise<HeldNews> {
  let asked = 0;
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => (release = done));
  await page.route(
    (url) => url.pathname === '/api/content/news',
    async (route) => {
      asked += 1;
      if (asked > 1) {
        await held;
      }
      await route.fulfill({
        json: { items: [article], page: 0, size: 10, total: 1, hasMore: false },
      });
    },
  );
  return { release: () => release(), asked: () => asked };
}

function tab(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Hlavní sekce' }).getByRole('link', { name });
}

test.describe('Given a visitor switching between the tabs', () => {
  test('when they return to a tab they have seen, then its content shows at once while the server is asked again', async ({
    page,
  }) => {
    const news = await newsAnsweredOnceThenHeld(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { name: article.title })).toBeVisible();

    await tab(page, 'O nás').click();
    await expect(page).toHaveURL(/\/o-nas$/);
    await tab(page, 'Aktuality').click();

    await expect(page.getByRole('heading', { name: article.title })).toBeVisible();
    await expect(page.getByText('Načítáme aktuality…')).toHaveCount(0);
    await expect.poll(news.asked).toBe(2);
    news.release();
  });

  test('when the first page has opened, then the pages of the other tabs are loaded ahead, so the first switch waits for no code', async ({
    page,
  }) => {
    const inFlight = requestsInFlight(page);
    await page.goto('/o-nas');
    await settled(page, inFlight, 10_000);

    const scripts: Request[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') {
        scripts.push(request);
      }
    });
    for (const [name, path] of [
      ['Aktuality', /\/aktuality$/],
      ['Pomáháme', /\/projekty$/],
      ['Přispět', /\/prispet$/],
    ] as const) {
      await tab(page, name).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    }

    expect(scripts.map((request) => new URL(request.url()).pathname)).toEqual([]);
  });
});
