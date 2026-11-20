import AxeBuilder from '@axe-core/playwright';
import { Locator, Page } from '@playwright/test';
import { mockDonorApi, samplePngBase64 } from './donor-session';
import { expect, test } from './fixtures';

const PNG = Buffer.from(samplePngBase64, 'base64');
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a002';
const EDGE_TOLERANCE_PX = 1;
const CATEGORIES = ['CHILDREN', 'ADULTS', 'ANIMALS', 'OTHER'];
const TITLES = [
  'Sofinka',
  'Nový vozík pro Michala, který se po úrazu znovu učí chodit',
  'Fenka Belinka',
  'Rehabilitace pro Natálku',
  'Střecha nad hlavou pro rodinu, které vyhořel dům',
];

interface Box {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

function stories(year: number, count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `0199f3e0-0000-7000-8000-${year}${String(index).padStart(8, '0')}`,
    slug: `pribeh-${year}-${index + 1}`,
    title: `${TITLES[index % TITLES.length]} ${index + 1}`,
    year,
    category: CATEGORIES[index % CATEGORIES.length],
    tag: index % 2 === 0 ? 'Pomůcky' : 'Léčba',
    perex:
      index % 2 === 0
        ? 'Krátké shrnutí.'
        : 'Delší shrnutí příběhu, které zabere více řádků a posune obsah dlaždice níž.',
    body: 'Text příběhu.',
    coverImage: {
      id: IMAGE_ID,
      url: `/api/content/media/${IMAGE_ID}`,
      alt: null,
      focalPoint: null,
    },
    publishedOn: `${year}-10-01`,
    createdAt: `${year}-09-19T09:00:00Z`,
    updatedAt: `${year}-10-01T07:30:00Z`,
    live: true,
  }));
}

const ITEMS = [...stories(2025, 3), ...stories(2024, 4), ...stories(2023, 9)];

async function openStories(page: Page, path: string, width = 1280): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({
        json: { items: ITEMS, page: 0, size: 50, total: ITEMS.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) => route.fulfill({ json: { items: [], page: 0, size: 50, total: 0, hasMore: false } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  await expect(page.locator('app-story-tile').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    const { top, left, right, bottom } = element.getBoundingClientRect();
    return { top, left, right, bottom };
  });
}

function yearSection(page: Page, year: number): Locator {
  return page.locator('section.year', { has: page.locator(`#rok-${year}`) });
}

test.describe('Given a visitor on the Pomáháme tab on a computer', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they choose another year, then the year chips stay where the pointer left them', async ({
    page,
  }) => {
    await openStories(page, '/projekty');
    const chip = page.getByRole('navigation', { name: 'Roky' }).getByRole('link', { name: '2024' });
    const before = await boxOf(chip);

    await chip.click();
    await expect(page.locator('p[role="status"]')).toHaveText('Rok 2024: 4 příběhy');

    expect((await boxOf(chip)).top).toBeCloseTo(before.top, 0);
  });

  for (const width of [1280, 1000]) {
    test(`when a strip holds more stories than a ${width} px window shows, then a mouse steps through it with Další příběhy and Předchozí příběhy`, async ({
      page,
    }) => {
      await openStories(page, '/projekty?rok=vse', width);
      const section = yearSection(page, 2023);
      const strip = section.locator('ul.strip');
      const back = section.getByRole('button', { name: 'Předchozí příběhy' });
      const on = section.getByRole('button', { name: 'Další příběhy' });
      await expect(back).toBeDisabled();

      await on.click();

      await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expect(back).toBeEnabled();
      await back.click();
      await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBe(0);
      const axe = await new AxeBuilder({ page })
        .include('section.year:has(#rok-2023)')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
    });

    test(`when the keyboard moves along a strip in a ${width} px window, then every focused tile shows whole`, async ({
      page,
    }) => {
      await openStories(page, '/projekty?rok=vse', width);
      const section = yearSection(page, 2023);
      const strip = section.locator('ul.strip');
      await section.locator('.tile-link').first().focus();

      for (let step = 0; step < 9; step += 1) {
        const frame = await boxOf(strip);
        const tile = await page.evaluate(() => {
          const focused = document.activeElement?.closest('app-story-tile, .strip-all');
          if (!focused) {
            return null;
          }
          const { top, left, right, bottom } = focused.getBoundingClientRect();
          return { top, left, right, bottom };
        });
        expect(tile).not.toBeNull();
        expect(tile!.left).toBeGreaterThanOrEqual(frame.left - EDGE_TOLERANCE_PX);
        expect(tile!.right).toBeLessThanOrEqual(frame.right + EDGE_TOLERANCE_PX);
        await page.keyboard.press('Tab');
      }
    });
  }

  test('when a year shows its stories as a grid, then the photos of the small tiles in one row have one height', async ({
    page,
  }) => {
    await openStories(page, '/projekty?rok=2023');

    const rows = await page
      .locator('ul.grid .grid-item:not(.grid-item--large)')
      .evaluateAll((items) =>
        items.map((item) => ({
          top: Math.round(item.getBoundingClientRect().top),
          media: item.querySelector('.tile-media')!.getBoundingClientRect().height,
        })),
      );
    const heights = new Map<number, number[]>();
    for (const { top, media } of rows) {
      heights.set(top, [...(heights.get(top) ?? []), media]);
    }
    expect(heights.size).toBeGreaterThan(1);
    for (const row of heights.values()) {
      expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
    }
  });

  test('when every year shows as a strip, then the photos of a strip have one height', async ({
    page,
  }) => {
    await openStories(page, '/projekty?rok=vse');

    const heights = await yearSection(page, 2023)
      .locator('ul.strip .tile-media')
      .evaluateAll((media) => media.map((element) => element.getBoundingClientRect().height));
    expect(heights.length).toBe(9);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  });

  test('when a year has a large tile beside small ones, then the tag and the kind of help look the same on both', async ({
    page,
  }) => {
    await openStories(page, '/projekty?rok=2025');

    const looks = await page.locator('app-story-tile').evaluateAll((tiles) =>
      tiles.map((tile) => {
        const tag = getComputedStyle(tile.querySelector('.tile-tag')!);
        const category = tile.querySelector('.tile-category')!;
        return {
          tag: [tag.backgroundColor, tag.color, tag.fontSize, tag.fontWeight].join(' '),
          dot: getComputedStyle(category, '::before').content,
        };
      }),
    );
    expect(looks.length).toBe(3);
    expect(new Set(looks.map((look) => look.tag)).size).toBe(1);
    expect(new Set(looks.map((look) => look.dot)).size).toBe(1);
  });

  test('when the summary shows the total and each kind of help, then every tile draws its number and caption alike', async ({
    page,
  }) => {
    await openStories(page, '/projekty');

    const tiles = await page.locator('.summary-tile').evaluateAll((elements) =>
      elements.map((tile) => {
        const number = tile.querySelector('.summary-number')!;
        const label = tile.querySelector('.summary-label')!;
        return {
          color: getComputedStyle(number).color,
          captionBelow:
            label.getBoundingClientRect().top >= number.getBoundingClientRect().bottom - 1,
        };
      }),
    );
    expect(tiles.length).toBe(5);
    expect(new Set(tiles.map((tile) => tile.color)).size).toBe(1);
    expect(tiles.every((tile) => tile.captionBelow)).toBe(true);
  });

  test('when a year has four stories, then its grid leaves no cell empty', async ({ page }) => {
    await openStories(page, '/projekty?rok=2024');

    const empty = await page.locator('ul.grid').evaluate((grid) => {
      const style = getComputedStyle(grid);
      const tracks = (value: string) => value.split(' ').map((size) => parseFloat(size));
      const columns = tracks(style.gridTemplateColumns);
      const rows = tracks(style.gridTemplateRows);
      const columnGap = parseFloat(style.columnGap);
      const rowGap = parseFloat(style.rowGap);
      const origin = grid.getBoundingClientRect();
      const items = Array.from(grid.children).map((item) => item.getBoundingClientRect());
      const holes: string[] = [];
      let y = origin.top;
      rows.forEach((height, row) => {
        let x = origin.left;
        columns.forEach((width, column) => {
          const centre = { x: x + width / 2, y: y + height / 2 };
          const covered = items.some(
            (item) =>
              centre.x >= item.left &&
              centre.x <= item.right &&
              centre.y >= item.top &&
              centre.y <= item.bottom,
          );
          if (!covered) {
            holes.push(`${row}:${column}`);
          }
          x += width + columnGap;
        });
        y += height + rowGap;
      });
      return holes;
    });
    expect(empty).toEqual([]);
  });
});
