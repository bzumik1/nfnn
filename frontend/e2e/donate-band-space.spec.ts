import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, samplePngBase64 } from './donor-session';

const PNG = Buffer.from(samplePngBase64, 'base64');
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';
const PIXEL_TOLERANCE = 1;

function article(slug: string, title: string, day: number): Record<string, unknown> {
  return {
    id: `0199f3e0-0000-7000-8000-0000000c00${day}`,
    slug,
    title,
    tag: 'Projekt',
    perex: `Co nového: ${title}.`,
    body: 'Text aktuality.',
    coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: null },
    publishedOn: `2026-10-1${day}`,
    createdAt: `2026-10-1${day}T09:00:00Z`,
    updatedAt: `2026-10-1${day}T09:00:00Z`,
  };
}

function story(slug: string, title: string, index: number): Record<string, unknown> {
  return {
    id: `0199f3e0-0000-7000-8000-0000000d00${index}`,
    slug,
    title,
    year: 2025,
    category: 'CHILDREN',
    tag: 'Pomůcky',
    perex: `Příběh ${title}.`,
    body: 'Text příběhu.',
    coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: null },
    publishedOn: `2025-10-0${index}`,
    createdAt: `2025-09-0${index}T09:00:00Z`,
    updatedAt: `2025-10-0${index}T07:30:00Z`,
    live: true,
  };
}

const NEWS = [
  article('zahrada-pro-deti', 'Zahrada pro děti', 3),
  article('novy-kocarek', 'Nový kočárek', 2),
  article('letni-tabor', 'Letní tábor', 1),
];

const STORIES = [
  story('sofinka', 'Sofinka', 3),
  story('natalka', 'Natálka', 2),
  story('dominik', 'Dominik', 1),
];

async function publishedContent(page: Page): Promise<void> {
  for (const [path, items] of [
    ['/api/content/news', NEWS],
    ['/api/content/projects', STORIES],
  ] as const) {
    await page.route(
      (url) => url.pathname === path,
      (route) =>
        route.fulfill({
          json: { items, page: 0, size: 50, total: items.length, hasMore: false },
        }),
    );
  }
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
}

interface BandRoom {
  above: number;
  below: number;
}

async function roomAroundBand(page: Page, path: string): Promise<BandRoom> {
  await page.goto(path);
  const band = page.locator('app-donate-band .band');
  await expect(band).toBeVisible();
  await band.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);

  return page.evaluate(() => {
    const transparent = 'rgba(0, 0, 0, 0)';
    const main = document.querySelector('main')!;
    const bandBox = document.querySelector('app-donate-band .band')!;
    const host = bandBox.closest('app-donate-band')!;
    let contentBottom = -Infinity;
    for (const element of main.querySelectorAll('*')) {
      if (
        element.contains(host) ||
        host.contains(element) ||
        !(host.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING)
      ) {
        continue;
      }
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width <= 1 || box.height <= 1 || style.visibility !== 'visible') {
        continue;
      }
      const painted =
        element.children.length === 0 ||
        element.tagName === 'IMG' ||
        element.tagName.toLowerCase() === 'svg' ||
        parseFloat(style.borderBottomWidth) > 0 ||
        style.backgroundColor !== transparent;
      if (painted) {
        contentBottom = Math.max(contentBottom, box.bottom);
      }
    }
    const band = bandBox.getBoundingClientRect();
    let pageEnd = band.bottom;
    for (const element of main.querySelectorAll('*')) {
      if (host.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
        if (!host.contains(element)) {
          pageEnd = Math.max(pageEnd, element.getBoundingClientRect().bottom);
        }
      }
    }
    pageEnd = Math.max(pageEnd, host.getBoundingClientRect().bottom);
    return { above: band.top - contentBottom, below: pageEnd - band.bottom };
  });
}

for (const screen of [
  { name: 'an iPhone SE', width: 375, height: 667 },
  { name: 'an iPhone', width: 390, height: 844 },
  { name: 'an iPad Pro 11" upright', width: 834, height: 1194 },
]) {
  test.describe(`Given a visitor on ${screen.name} (${screen.width} × ${screen.height}) on the pages that close with the Přispět band`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height }, reducedMotion: 'reduce' });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await publishedContent(page);
    });

    test('when they scroll to the band on O nás, Kde pomáháme and Aktuality, then the band keeps one space above it on every page and the same room towards the tab bar where it ends the page', async ({
      page,
    }) => {
      const about = await roomAroundBand(page, '/o-nas');
      const projects = await roomAroundBand(page, '/projekty');
      const news = await roomAroundBand(page, '/aktuality');

      expect(Math.abs(projects.above - about.above)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs(news.above - about.above)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs(news.below - projects.below)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    });
  });
}
