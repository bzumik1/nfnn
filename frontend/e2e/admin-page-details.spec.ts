import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { rememberedAdministrator, routeLogsApi } from './admin-logs-api';
import { mockDonorApi } from './donor-session';

const NEWS = '/api/admin/content/news';
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';
const ARTICLE_ID = '0199f3e0-0000-7000-8000-00000000c001';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
  'base64',
);
const LONG_TITLES = [
  'Benefiční koncert pro děti z dětských domovů a jejich rodiny v kulturním domě na konci podzimu',
  'Zahrada pro děti, kde si budou hrát, pěstovat zeleninu a učit se o přírodě celý rok',
  'Poděkování všem dárcům, kteří letos přispěli na letní tábor a na nové vybavení herny',
];

function article(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `0199f3e0-0000-7000-8000-00000000c00${index + 1}`,
    slug: `aktualita-${index + 1}`,
    title: LONG_TITLES[index],
    tag: 'Projekt',
    perex: 'Stavíme zahradu, kde si děti budou hrát.',
    body: 'První odstavec.\n\nDruhý odstavec.',
    coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: null },
    publishedOn: '2026-10-20',
    live: true,
    createdAt: '2026-10-19T09:00:00Z',
    updatedAt: '2026-10-20T07:30:00Z',
    version: '4c9e1a7b20d3f856',
    ...overrides,
  };
}

async function servePhotos(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
}

async function lineTops(cell: Locator): Promise<number[]> {
  return cell.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = [...range.getClientRects()]
      .filter((box) => box.width > 0)
      .map((box) => Math.round(box.top));
    return [...new Set(tops)];
  });
}

test.describe('Given an administrator editing the news on a computer', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
    await rememberedAdministrator(page);
  });

  test('when the news list holds long titles, then each edit time stays on one line with its date', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === NEWS,
      (route) => route.fulfill({ json: { items: [0, 1, 2].map((index) => article(index)) } }),
    );

    await page.goto('/sprava/aktuality');

    const edited = page.locator('tbody td[data-label="Upraveno"]');
    await expect(edited).toHaveCount(3);
    for (const cell of await edited.all()) {
      await expect(cell).toHaveText('20. 10. 2026 9:30');
      expect(await lineTops(cell)).toHaveLength(1);
    }
  });

  test('when an article with a photo opens in the editor, then the crop previews of each row start at one edge and their captions stand on one line', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === `${NEWS}/${ARTICLE_ID}`,
      (route) => route.fulfill({ json: article(0) }),
    );

    await page.goto(`/sprava/aktuality/${ARTICLE_ID}`);

    const previews = page.locator('.previews .preview');
    await expect(previews).toHaveCount(6);
    const boxes = await previews.evaluateAll((figures) =>
      figures.map((figure) => ({
        frame: Math.round(figure.querySelector('.preview-frame')!.getBoundingClientRect().top),
        caption: Math.round(figure.querySelector('figcaption')!.getBoundingClientRect().top),
      })),
    );
    const rows = new Map<number, number[]>();
    for (const box of boxes) {
      rows.set(box.frame, [...(rows.get(box.frame) ?? []), box.caption]);
    }
    expect(rows.size).toBeLessThan(boxes.length);
    for (const captions of rows.values()) {
      expect(new Set(captions).size).toBe(1);
    }
  });
});

test.describe('Given an administrator reading the thread dump on a computer', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await routeLogsApi(page);
    await rememberedAdministrator(page);
  });

  test('when the keyboard reaches the dump, then its whole focus ring lies inside its card', async ({
    page,
  }) => {
    await page.goto('/sprava/logy/vlakna');
    const dump = page.locator('pre.dump');
    await expect(dump).toContainText('"main" #1 state=RUNNABLE');

    await page.getByRole('button', { name: 'Kopírovat výpis vláken' }).focus();
    await page.keyboard.press('Tab');

    await expect(dump).toBeFocused();
    const ring = await dump.evaluate((element) => {
      const style = getComputedStyle(element);
      const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      const box = element.getBoundingClientRect();
      const card = element.closest('.ui-card')!.getBoundingClientRect();
      return {
        visible: element.matches(':focus-visible') && style.outlineStyle !== 'none',
        left: Math.round(box.left - reach - card.left),
        right: Math.round(card.right - (box.right + reach)),
      };
    });
    expect(ring.visible).toBe(true);
    expect(ring.left).toBeGreaterThanOrEqual(0);
    expect(ring.right).toBeGreaterThanOrEqual(0);
  });
});
