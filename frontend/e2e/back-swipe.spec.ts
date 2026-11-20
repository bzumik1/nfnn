import { CDPSession, Locator, Page } from '@playwright/test';
import { administrator, mockDonorApi, session, whenAdministrationCopied } from './donor-session';
import { NEWS_PAGE_SIZE } from '../src/app/features/content/content-page-sizes';
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

function asked(page: Page, path: string, params: Record<string, string> = {}): () => number {
  let count = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    const matches = Object.entries(params).every(
      ([name, value]) => url.searchParams.get(name) === value,
    );
    if (url.pathname === path && matches) {
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
    const listAsked = asked(page, '/api/content/news', { size: String(NEWS_PAGE_SIZE) });
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

const pairedPayment = {
  id: '019a1c00-0000-7000-8000-000000001001',
  bankTransactionId: 1001,
  bookedOn: '2026-10-10',
  amountMinor: 50000,
  currency: 'CZK',
  variableSymbol: '1111111111',
  counterpartyAccount: '2900233333/2010',
  counterpartyName: 'Nováková Jana',
  messageForRecipient: 'Dar pro fond',
  importedAt: '2026-10-17T10:00:00Z',
  unpairedByAdminAt: null,
  accountVerification: false,
  donation: {
    id: 'd1',
    donorId: administrator.id,
    donorName: 'Jana Nováková',
    pairedBy: 'MANUAL',
    status: 'RECEIVED',
    recordedAt: '2026-10-18T09:00:00Z',
    receiptIssued: false,
  },
};

const otherPayments = Array.from({ length: 24 }, (_, index) => ({
  ...pairedPayment,
  id: `019a1c00-0000-7000-8000-0000000020${String(index).padStart(2, '0')}`,
  bankTransactionId: 2000 + index,
  bookedOn: `2026-10-${String(30 - index).padStart(2, '0')}`,
  variableSymbol: '2222222222',
  counterpartyName: 'Dvořák Petr',
  donation: {
    ...pairedPayment.donation,
    id: `d2${index}`,
    donorId: '0199f3e0-0000-7000-8000-00000000d002',
    donorName: 'Petr Dvořák',
  },
}));

async function expectWhollyInView(page: Page, target: Locator): Promise<void> {
  await expect(async () => {
    const box = (await target.boundingBox())!;
    const banner = (await page.getByRole('banner').boundingBox())!;
    const tabBar = page.getByRole('navigation', { name: 'Hlavní sekce' });
    const floor = (await tabBar.isVisible())
      ? (await tabBar.boundingBox())!.y
      : page.viewportSize()!.height;
    expect(Math.round(box.y)).toBeGreaterThanOrEqual(Math.round(banner.y + banner.height));
    expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(floor);
  }).toPass();
}

test.describe("Given the app on the home screen of a phone and an administrator who followed a paired payment's donor from the payments", () => {
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
      (url) => url.pathname === '/api/admin/donations/payments',
      (route) => {
        const pairedOnly = new URL(route.request().url()).searchParams.get('pairing') === 'paired';
        return route.fulfill({
          json: {
            year: null,
            availableYears: pairedOnly ? [2026] : [],
            items: pairedOnly ? [...otherPayments, pairedPayment] : [],
            total: pairedOnly ? otherPayments.length + 1 : 0,
          },
        });
      },
    );
    const copied = whenAdministrationCopied(page);
    await page.goto('/sprava');
    await copied();
    await page
      .getByRole('main')
      .getByRole('link', { name: /^Platby z\sbanky/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/sprava\/platby/);
    await page.getByRole('button', { name: 'Přiřazené', exact: true }).click();
    await page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ }).click();
    await page
      .getByRole('dialog', { name: 'Přiřazená platba' })
      .getByRole('link', { name: 'Jana Nováková' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/sprava/darci/${administrator.id}$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test("when a finger drags the donor card back, then the payments lie under it, and on letting go they return with the payment's row focused", async ({
    page,
  }) => {
    const finger = await fingerOn(page);

    await drag(finger, 30, 250);
    await expect(swipeOverlay(page).locator('.page-transition__page--under h1')).toHaveText(
      'Platby z banky',
    );
    await restLongerThanAFlick(page);
    await finger.up();

    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene$/);
    await expect(page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ })).toBeFocused();
    await expectWhollyInView(
      page,
      page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ }),
    );
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });
});
