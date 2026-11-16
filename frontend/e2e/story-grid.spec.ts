import { Page } from '@playwright/test';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';

const YEAR = 2025;
const EDGE_TOLERANCE_PX = 1;

function storiesWithoutPhotos(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `0199f3e0-0000-7000-8000-0000000d${String(index).padStart(4, '0')}`,
    slug: `pribeh-${index + 1}`,
    title: `Příběh ${index + 1}`,
    year: YEAR,
    category: 'CHILDREN',
    tag: 'Pomůcky',
    perex: `Krátké shrnutí příběhu ${index + 1}.`,
    body: 'Text příběhu.',
    coverImage: null,
    publishedOn: `${YEAR}-10-0${index + 1}`,
    createdAt: `${YEAR}-09-19T09:00:00Z`,
    updatedAt: `${YEAR}-10-01T07:30:00Z`,
    live: true,
  }));
}

async function openStories(page: Page, count: number, width: number): Promise<void> {
  const items = storiesWithoutPhotos(count);
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({ json: { items, page: 0, size: 50, total: items.length, hasMore: false } }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) => route.fulfill({ json: { items: [], page: 0, size: 50, total: 0, hasMore: false } }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/projekty');
  await expect(page.locator('app-story-tile')).toHaveCount(count);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

interface Box {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

function gridBoxes(page: Page): Promise<{ grid: Box; items: Box[]; tiles: Box[] }> {
  return page.locator('ul.grid').evaluate((grid) => {
    const box = (element: Element): Box => {
      const { top, left, right, bottom } = element.getBoundingClientRect();
      return { top, left, right, bottom };
    };
    const items = Array.from(grid.querySelectorAll(':scope > .grid-item'));
    return {
      grid: box(grid),
      items: items.map(box),
      tiles: items.map((item) => box(item.querySelector('.tile')!)),
    };
  });
}

test.describe('Given a year of stories without photos on the Pomáháme tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  for (const count of [2, 3]) {
    test(`when ${count} stories show in a 900 px window, then the large tile stays inside its row and above the Přispět band`, async ({
      page,
    }) => {
      await openStories(page, count, 900);

      const { items, tiles } = await gridBoxes(page);
      expect(tiles[0].bottom).toBeLessThanOrEqual(items[0].bottom + EDGE_TOLERANCE_PX);
      const band = await page.locator('app-donate-band').boundingBox();
      expect(tiles[0].bottom).toBeLessThanOrEqual(band!.y + EDGE_TOLERANCE_PX);
    });
  }

  test('when the text is twice as large, then the large tile grows to hold its text instead of cutting it', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'html { font-size: 200%; }';
        document.head.append(style);
      });
    });
    await openStories(page, 2, 900);

    const large = page.locator('.tile--large').first();
    const fits = await large.evaluate((tile) => {
      const body = tile.querySelector('.tile-body')!.getBoundingClientRect();
      return body.bottom <= tile.getBoundingClientRect().bottom + 1;
    });
    expect(fits).toBe(true);
    const { items, tiles } = await gridBoxes(page);
    expect(tiles[0].bottom).toBeLessThanOrEqual(items[0].bottom + EDGE_TOLERANCE_PX);
  });

  for (const width of [832, 834, 899, 900]) {
    for (const count of [1, 2, 3]) {
      test(`when ${count} ${count === 1 ? 'story shows' : 'stories show'} in a ${width} px window, then every row of tiles fills the width of the list`, async ({
        page,
      }) => {
        await openStories(page, count, width);

        const { grid, tiles } = await gridBoxes(page);
        const rows = new Map<number, number>();
        for (const tile of tiles) {
          const row = Math.round(tile.top);
          rows.set(row, Math.max(rows.get(row) ?? 0, tile.right));
        }
        for (const right of rows.values()) {
          expect(right).toBeGreaterThanOrEqual(grid.right - EDGE_TOLERANCE_PX);
        }
      });
    }
  }
});
