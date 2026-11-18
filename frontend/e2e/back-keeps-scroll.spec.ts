import type { Page } from '@playwright/test';
import {
  administrator,
  mockDonorApi,
  openAccountItem,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';

const FLICK_REST_MS = 100;
const FINGER_Y = 420;
const LIST_TITLE = 'Co je u nás nového';

function news(index: number): Record<string, unknown> {
  return {
    id: `0199f3e0-0000-7000-8000-00000000c4${String(index).padStart(2, '0')}`,
    slug: `zprava-${index}`,
    title: `Zpráva ${index}`,
    tag: null,
    perex: 'Krátce o tom, co se u nás stalo, aby bylo v seznamu co číst.',
    body: 'Text.',
    coverImage: null,
    publishedOn: `2026-10-${String(20 - index).padStart(2, '0')}`,
    createdAt: '2026-10-01T09:00:00Z',
    updatedAt: '2026-10-01T09:00:00Z',
    signer: null,
    lookBackYear: null,
    live: true,
  };
}

const LOOK_BACK = {
  ...news(10),
  slug: 'ohlednuti-za-rokem-2025',
  title: 'Ohlédnutí za rokem 2025',
  lookBackYear: 2025,
};

const NEWS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(news).concat(LOOK_BACK);

const STORY = {
  id: '0199f3e0-0000-7000-8000-00000000c501',
  slug: 'sofinka',
  title: 'Sofinka',
  year: 2025,
  category: 'CHILDREN',
  tag: 'Pomůcky',
  perex: 'Příběh Sofinky.',
  body: 'Text příběhu.',
  coverImage: null,
  publishedOn: '2025-10-01',
  createdAt: '2025-09-19T09:00:00Z',
  updatedAt: '2025-10-01T07:30:00Z',
  live: true,
};

async function publishedContent(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({
        json: { items: NEWS, page: 0, size: 10, total: NEWS.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname === `/api/content/news/${LOOK_BACK.slug}`,
    (route) => route.fulfill({ json: LOOK_BACK }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({ json: { items: [STORY], page: 0, size: 50, total: 1, hasMore: false } }),
  );
}

function tab(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Hlavní sekce' }).getByRole('link', { name });
}

function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

async function newsScrolledFarDown(page: Page): Promise<number> {
  await page.goto('/aktuality');
  await expect(page.getByRole('heading', { name: 'Zpráva 9' })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(500);
  return scrollY(page);
}

function oneLine(page: Page): Promise<number> {
  return page
    .getByRole('main')
    .locator('p')
    .first()
    .evaluate((text) => {
      const style = getComputedStyle(text);
      return Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5;
    });
}

async function listScrolledAndLeftForAnotherTab(page: Page): Promise<number> {
  const listTop = await newsScrolledFarDown(page);

  await tab(page, 'Pomáháme').click();
  await expect(page).toHaveURL('/projekty');
  await page.getByRole('link', { name: LOOK_BACK.title }).click();
  await expect(page).toHaveURL(`/aktuality/${LOOK_BACK.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: LOOK_BACK.title })).toBeVisible();
  await expect(page.locator('.page-transition')).toHaveCount(0);
  return listTop;
}

function touch(page: Page, type: string, xs: readonly number[]): Promise<void> {
  return page.evaluate(
    ({ type, xs, y }) => {
      for (const x of xs) {
        const point = { identifier: 0, clientX: x, clientY: y, target: document.body };
        const event = new Event(type, { bubbles: true });
        Object.defineProperties(event, {
          touches: { value: type === 'touchend' ? [] : [point] },
          changedTouches: { value: [point] },
        });
        document.body.dispatchEvent(event);
      }
    },
    { type, xs, y: FINGER_Y },
  );
}

async function restLongerThanAFlick(page: Page): Promise<void> {
  const restStartedAt = await page.evaluate(() => performance.now());
  await expect
    .poll(() => page.evaluate(() => performance.now()))
    .toBeGreaterThan(restStartedAt + FLICK_REST_MS);
}

function copyUnderTheFinger(page: Page) {
  return page.locator('.page-transition--swipe .page-transition__page--under');
}

function copyTop(page: Page): Promise<number> {
  return copyUnderTheFinger(page)
    .locator('.page-transition__scroller')
    .evaluate((scroller) => Math.round(scroller.scrollTop));
}

test.describe('Given the app on the home screen of a phone with the news scrolled and an article of the news opened from the Pomáháme tab', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
    });
    await mockDonorApi(page);
    await publishedContent(page);
  });

  test('when Zpět is pressed, then the news returns where they left it', async ({ page }) => {
    const listTop = await listScrolledAndLeftForAnotherTab(page);

    await page.getByRole('button', { name: 'Zpět' }).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect.poll(() => scrollY(page)).toBe(listTop);
  });

  test('when a finger drags the article back, then the news lies under it where they left it, and on letting go it returns there, as by Zpět', async ({
    page,
  }) => {
    const listTop = await listScrolledAndLeftForAnotherTab(page);

    await touch(page, 'touchstart', [30]);
    await touch(page, 'touchmove', [52, 74, 96, 118, 140, 162, 184, 206, 228, 250]);

    await expect(copyUnderTheFinger(page).locator('h1')).toHaveText(LIST_TITLE);
    await expect.poll(() => copyTop(page)).toBe(listTop);
    await restLongerThanAFlick(page);
    await touch(page, 'touchend', [250]);

    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect.poll(() => scrollY(page)).toBe(listTop);
  });
});

test.describe('Given an administrator on a phone with the news scrolled far down', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await publishedContent(page);
    await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
  });

  test('when they open Správa from the account sheet and press Zpět, then the news, drawn again, returns where they left it', async ({
    page,
  }) => {
    const copied = whenAdministrationCopied(page);
    const listTop = await newsScrolledFarDown(page);
    const line = await oneLine(page);
    await openAccountItem(page, 'Správa');
    await expect(page).toHaveURL(/\/sprava$/);
    await copied();

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { name: 'Zpráva 9' })).toBeAttached();
    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect
      .poll(async () => Math.abs((await scrollY(page)) - listTop))
      .toBeLessThanOrEqual(line);
  });
});
