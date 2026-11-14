import { CDPSession, Page } from '@playwright/test';
import {
  administrator,
  mockDonorApi,
  openAccountItem,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';

const FLICK_REST_MS = 100;

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c021',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

const LIST_TITLE = 'Co je u nás nového';

interface Finger {
  down(x: number): Promise<void>;
  move(x: number): Promise<void>;
  up(): Promise<void>;
}

async function fingerOn(page: Page): Promise<Finger> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const y = 420;
  return {
    down: async (x) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    },
    move: async (x) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    },
    up: async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
  };
}

async function restLongerThanAFlick(page: Page): Promise<void> {
  const restStartedAt = await page.evaluate(() => performance.now());
  await expect
    .poll(() => page.evaluate(() => performance.now()))
    .toBeGreaterThan(restStartedAt + FLICK_REST_MS);
}

async function drag(finger: Finger, from: number, to: number): Promise<void> {
  await finger.down(from);
  for (let step = 1; step <= 10; step++) {
    await finger.move(from + ((to - from) * step) / 10);
  }
}

function asked(page: Page, path: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === path) {
      count++;
    }
  });
  return () => count;
}

function swipeOverlay(page: Page) {
  return page.locator('.page-transition--swipe');
}

function pageOffset(page: Page): Promise<number> {
  return page
    .locator('.page-transition--swipe .page-transition__page--over')
    .evaluate((over) => new DOMMatrixReadOnly(getComputedStyle(over).transform).m41);
}

async function openArticleFromList(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await page.getByRole('link', { name: article.title }).click();
  await expect(page).toHaveURL(`/aktuality/${article.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
  await expect(page.locator('.page-transition')).toHaveCount(0);
}

test.describe('Given the app on the home screen of a phone with an article opened from the list', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'touch events come only through CDP; the swipe in Safari is recorded on the iOS simulator',
  );
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }),
    );
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === `/api/content/news/${article.slug}`,
      (route) => route.fulfill({ json: article }),
    );
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
    );
  });

  test('when a finger drags the article past half the width and rests, then the list shows under it and follows, and on letting go the list returns with the link to that article focused', async ({
    page,
  }) => {
    await openArticleFromList(page);
    const finger = await fingerOn(page);

    await drag(finger, 30, 250);

    await expect(swipeOverlay(page)).toHaveAttribute('aria-hidden', 'true');
    await expect(swipeOverlay(page).locator('.page-transition__page--under h1')).toHaveText(
      LIST_TITLE,
    );
    await expect(swipeOverlay(page).locator('.page-transition__page--over h1')).toHaveText(
      article.title,
    );
    expect(await pageOffset(page)).toBeCloseTo(220, 0);

    await restLongerThanAFlick(page);
    await finger.up();

    await expect(page).toHaveURL('/aktuality');
    await expect(
      page.getByRole('main').locator(`a[href="/aktuality/${article.slug}"]`).first(),
    ).toBeFocused();
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger drags the article less than half the width and rests, then the article slides back and stays', async ({
    page,
  }) => {
    await openArticleFromList(page);
    const finger = await fingerOn(page);

    await drag(finger, 30, 150);
    await expect(swipeOverlay(page)).toHaveCount(1);
    await restLongerThanAFlick(page);
    await finger.up();

    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
  });

  test('when a finger flicks the article a short way to the right, then the list returns', async ({
    page,
  }) => {
    await openArticleFromList(page);
    const finger = await fingerOn(page);

    await drag(finger, 30, 150);
    await finger.up();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when the article was opened afresh and a finger drags it back, then the list, never shown before, is drawn under it and on letting go is the page that opens without being asked for again', async ({
    page,
  }) => {
    const listAsked = asked(page, '/api/content/news');
    await page.goto(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
    const finger = await fingerOn(page);

    await drag(finger, 30, 250);

    await expect(swipeOverlay(page).locator('.page-transition__page--under h1')).toHaveText(
      LIST_TITLE,
    );
    await restLongerThanAFlick(page);
    await finger.up();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
    await expect(page.locator('.page-transition')).toHaveCount(0);
    expect(listAsked()).toBe(1);
  });

  test('when the article was opened afresh and the swipe is called off, then the article is the same live page, not drawn again', async ({
    page,
  }) => {
    const articleAsked = asked(page, `/api/content/news/${article.slug}`);
    await page.goto(`/aktuality/${article.slug}`);
    const heading = page.getByRole('heading', { level: 1, name: article.title });
    await expect(heading).toBeVisible();
    await heading.evaluate((element) => element.setAttribute('data-still-the-same', ''));
    const finger = await fingerOn(page);

    await drag(finger, 30, 150);
    await expect(swipeOverlay(page).locator('.page-transition__page--under h1')).toHaveText(
      LIST_TITLE,
    );
    await restLongerThanAFlick(page);
    await finger.up();

    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(heading).toHaveAttribute('data-still-the-same', '');
    expect(articleAsked()).toBe(1);
  });

  test('when the visitor asks for less motion, then nothing follows the finger and letting go past half still returns to the list', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openArticleFromList(page);
    const finger = await fingerOn(page);

    await drag(finger, 30, 250);
    await expect(swipeOverlay(page)).toHaveCount(0);
    await restLongerThanAFlick(page);
    await finger.up();

    await expect(page).toHaveURL('/aktuality');
  });
});

test.describe('Given the app on the home screen of a phone and an administrator who opened the administration from the account sheet over the news', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'touch events come only through CDP; the swipe in Safari is recorded on the iOS simulator',
  );
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      localStorage.setItem('nfnn.donor-session-app', '1');
    });
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
    );
    const copied = whenAdministrationCopied(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
    await openAccountItem(page, 'Správa');
    await expect(page).toHaveURL(/\/sprava$/);
    await copied();
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger drags the administration sheet back, then the news lies under it without the account sheet, and on letting go the news returns', async ({
    page,
  }) => {
    const finger = await fingerOn(page);

    await drag(finger, 30, 150);
    await expect(swipeOverlay(page).locator('.page-transition__page--under h1')).toHaveText(
      LIST_TITLE,
    );
    await expect(swipeOverlay(page).locator('dialog')).toHaveCount(0);
    await finger.move(250);
    await expect.poll(() => pageOffset(page)).toBeCloseTo(220, 0);

    await restLongerThanAFlick(page);
    await finger.up();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });
});

test.describe('Given the app on the home screen of a phone opened by an administrator straight on the administration', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'touch events come only through CDP; the swipe in Safari is recorded on the iOS simulator',
  );
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      localStorage.setItem('nfnn.donor-session-app', '1');
    });
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    const copied = whenAdministrationCopied(page);
    await page.goto('/sprava');
    await copied();
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger drags the administration back, then the landing page, never shown in this visit, lies under it, and on letting go it opens', async ({
    page,
  }) => {
    const finger = await fingerOn(page);

    await drag(finger, 30, 250);
    await expect(swipeOverlay(page).locator('.page-transition__page--under h1')).toHaveText(
      'Nová naděje',
    );
    await restLongerThanAFlick(page);
    await finger.up();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });
});
