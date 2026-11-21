import { Locator, Page } from '@playwright/test';
import { mockDonorApi, samplePngBase64 } from './donor-session';
import { expect, test } from './fixtures';

const PNG = Buffer.from(samplePngBase64, 'base64');
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a003';
const PIXEL_TOLERANCE = 1;
const NEWS_TITLES = [
  'Zahrada pro děti',
  'Letní tábor',
  'Nový vozík pro Michala, který se po úrazu znovu učí chodit a těší se domů',
  'Koncert',
];
const STORY_TITLES = [
  'Sofinka',
  'Fenka Belinka',
  'Střecha nad hlavou pro rodinu, které vyhořel dům a zůstala jen se vším, co unesla',
  'Rehabilitace pro Natálku',
];

const cover = {
  id: IMAGE_ID,
  url: `/api/content/media/${IMAGE_ID}`,
  alt: null,
  focalPoint: null,
};

const news = NEWS_TITLES.map((title, index) => ({
  id: `0199f3e0-0000-7000-8000-0000000c${String(index).padStart(4, '0')}`,
  slug: `aktualita-${index + 1}`,
  title,
  tag: index % 2 === 0 ? 'Projekt' : null,
  perex:
    index === 2
      ? 'Delší shrnutí aktuality, které zabere více řádků a posune obsah karty níž, aby byla vyšší než ostatní.'
      : 'Krátké shrnutí.',
  body: 'Text aktuality.',
  coverImage: index === 1 ? null : cover,
  signer: null,
  live: true,
  publishedOn: `2026-10-${String(20 - index).padStart(2, '0')}`,
  createdAt: '2026-10-01T09:00:00Z',
  updatedAt: '2026-10-01T09:00:00Z',
}));

const stories = STORY_TITLES.map((title, index) => ({
  id: `0199f3e0-0000-7000-8000-0000000e${String(index).padStart(4, '0')}`,
  slug: `pribeh-${index + 1}`,
  title,
  year: 2026,
  category: 'CHILDREN',
  tag: index % 2 === 0 ? 'Pomůcky' : 'Léčba',
  perex:
    index === 2
      ? 'Delší shrnutí příběhu, které zabere více řádků a posune obsah dlaždice níž.'
      : 'Krátké shrnutí.',
  body: 'Text příběhu.',
  coverImage: index === 1 ? null : cover,
  publishedOn: '2026-10-01',
  createdAt: '2026-09-19T09:00:00Z',
  updatedAt: '2026-10-01T07:30:00Z',
  live: true,
}));

async function publishedContent(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({
        json: { items: news, page: 0, size: 10, total: news.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/news/'),
    (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').at(-1);
      return route.fulfill({ json: news.find((item) => item.slug === slug) ?? news[0] });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({
        json: { items: stories, page: 0, size: 50, total: stories.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/projects/'),
    (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').at(-1);
      return route.fulfill({ json: stories.find((item) => item.slug === slug) ?? stories[0] });
    },
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
}

async function settled(page: Page, cards: Locator, count: number): Promise<void> {
  await expect(cards).toHaveCount(count);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function columnsOf(cards: Locator): Promise<number> {
  const lefts = await cards.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().left)),
  );
  return new Set(lefts).size;
}

async function widthsOf(cards: Locator): Promise<number[]> {
  return cards.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  );
}

async function fontSizeOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).fontSize);
}

test.describe('Given a visitor reading a news article on a computer 1280 px wide', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedContent(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('when Další aktuality show, then their cards stand in as many columns of the same width as the list and their heading is as large as the list heading', async ({
    page,
  }) => {
    await page.goto('/aktuality');
    const listCards = page.locator('.older app-news-card');
    await settled(page, listCards, 3);
    const listColumns = await columnsOf(listCards);
    const listWidth = (await widthsOf(listCards))[0];
    const listHeading = await fontSizeOf(
      page.getByRole('heading', { level: 2, name: 'Starší aktuality' }),
    );

    await page.goto(`/aktuality/${news[0].slug}`);
    const side = page.getByRole('complementary', { name: 'Další aktuality' });
    const onwardCards = side.locator('app-news-card');
    await settled(page, onwardCards, 3);

    expect(await columnsOf(onwardCards)).toBe(listColumns);
    for (const width of await widthsOf(onwardCards)) {
      expect(Math.abs(width - listWidth)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    }
    expect(await fontSizeOf(side.getByRole('heading', { level: 2 }))).toBe(listHeading);
  });

  test('when Další aktuality show under the article, then their heading starts where the article title starts', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${news[0].slug}`);
    const side = page.getByRole('complementary', { name: 'Další aktuality' });
    await settled(page, side.locator('app-news-card'), 3);

    const lefts = await page.evaluate(() => ({
      title: Math.round(
        document.querySelector('app-content-article h1')!.getBoundingClientRect().left,
      ),
      onward: Math.round(document.querySelector('.onward-heading')!.getBoundingClientRect().left),
    }));

    expect(Math.abs(lefts.onward - lefts.title)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
  });
});

test.describe('Given a visitor reading a story on a computer 1280 px wide', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedContent(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('when Další příběhy show in one row, then every tile is as tall as the row, as in the list', async ({
    page,
  }) => {
    await page.goto(`/projekty/${stories[0].slug}`);
    const side = page.getByRole('complementary', { name: /^Další příběhy z\s+roku 2026$/ });
    const tiles = side.locator('app-story-tile .tile');
    await settled(page, tiles, 3);

    const boxes = await tiles.evaluateAll((elements) =>
      elements.map((element) => {
        const { top, height } = element.getBoundingClientRect();
        return { top, height };
      }),
    );

    expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
    const heights = boxes.map((box) => box.height);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
  });
});

async function roomBelow(block: Locator): Promise<number> {
  return block.evaluate(
    (element) =>
      document.documentElement.scrollHeight - (element.getBoundingClientRect().bottom + scrollY),
  );
}

for (const screen of [
  { name: 'a phone', width: 390, height: 844 },
  { name: 'a tablet', width: 820, height: 1180 },
]) {
  test.describe(`Given a visitor who reads an article or a story to its end on ${screen.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await publishedContent(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: screen.width, height: screen.height });
    });

    test('when the onward cards close the page, then as much room stays under them as under the closing band of the lists', async ({
      page,
    }) => {
      await page.goto('/aktuality');
      const listCards = page.locator('.older app-news-card');
      await settled(page, listCards, 3);
      const band = page.locator('app-donate-band .band');
      await expect(band).toBeVisible();
      const underBand = await roomBelow(band);

      await page.goto(`/aktuality/${news[0].slug}`);
      const newsList = page.locator('.onward-list');
      await settled(page, newsList.locator('app-news-card'), 3);
      expect(Math.abs((await roomBelow(newsList)) - underBand)).toBeLessThanOrEqual(
        PIXEL_TOLERANCE,
      );

      await page.goto(`/projekty/${stories[0].slug}`);
      const storyList = page.locator('.onward-list');
      await settled(page, storyList.locator('app-story-tile .tile'), 3);
      expect(Math.abs((await roomBelow(storyList)) - underBand)).toBeLessThanOrEqual(
        PIXEL_TOLERANCE,
      );
    });
  });
}

test.describe('Given a visitor reading an article with a photo on an iPad held upright, with the system text at its default 17 px', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedContent(page);
    await page.setViewportSize({ width: 820, height: 1180 });
  });

  test('when the photo shows above the text, then it ends where the text column ends', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${news[0].slug}`);
    await page.addStyleTag({ content: 'html { font-size: 17px; }' });
    const photo = page.locator('.photo');
    const prose = page.locator('.prose');
    await expect(photo).toBeVisible();
    await expect(prose).toBeVisible();

    const photoBox = (await photo.boundingBox())!;
    const proseBox = (await prose.boundingBox())!;
    expect(Math.abs(photoBox.x - proseBox.x)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    expect(
      Math.abs(photoBox.x + photoBox.width - (proseBox.x + proseBox.width)),
    ).toBeLessThanOrEqual(PIXEL_TOLERANCE);
  });
});
