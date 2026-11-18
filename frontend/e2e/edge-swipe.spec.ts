import { Page } from '@playwright/test';
import {
  administrator,
  mockDonorApi,
  openAccountItem,
  openUnlockedAdministrationPage,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';
import { waitWhileNothingMayHappen } from './fixed-waits';

const FINGER_Y = 420;
const LIST_TITLE = 'Co je u nás nového';
const SETTLED_MS = 600;
const TRANSITION_ENDS_WITHIN_MS = 4000;

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

type LegacyTouchDocument = Document & {
  createTouch?(
    view: Window,
    target: EventTarget,
    identifier: number,
    pageX: number,
    pageY: number,
    screenX: number,
    screenY: number,
  ): Touch;
  createTouchList?(...touches: Touch[]): TouchList;
};

interface FingerProbe {
  fingerTarget: Element;
  underWhenTaken: string | null;
}

async function touchAt(page: Page, type: string, x: number): Promise<void> {
  await page.evaluate(
    ({ type, x, y }) => {
      const probe = window as unknown as FingerProbe;
      const document = window.document as LegacyTouchDocument;
      if (type === 'touchstart') {
        probe.fingerTarget = document.elementFromPoint(x, y) ?? document.body;
      }
      const target = probe.fingerTarget;
      const touches = (
        typeof document.createTouch === 'function' && typeof document.createTouchList === 'function'
          ? document.createTouchList(
              document.createTouch(window, target, 1, x + scrollX, y + scrollY, x, y),
            )
          : [new Touch({ identifier: 1, target, clientX: x, clientY: y })]
      ) as Touch[];
      const none = (
        typeof document.createTouchList === 'function' ? document.createTouchList() : []
      ) as Touch[];
      const touching = type !== 'touchend';
      target.dispatchEvent(
        new TouchEvent(type, {
          touches: touching ? touches : none,
          targetTouches: touching ? touches : none,
          changedTouches: touches,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { type, x, y: FINGER_Y },
  );
}

async function takeWithFinger(page: Page, from: number): Promise<void> {
  await page.evaluate(() => {
    const probe = window as unknown as FingerProbe;
    probe.underWhenTaken = null;
    const watch = new MutationObserver(() => {
      const under = document.querySelector('.page-transition--swipe .page-transition__page--under');
      if (under !== null) {
        watch.disconnect();
        probe.underWhenTaken = under.querySelector('h1')?.textContent?.trim() ?? '';
      }
    });
    watch.observe(document.body, { childList: true });
  });
  await touchAt(page, 'touchstart', from);
  for (const step of [10, 25, 45, 70, 100]) {
    await touchAt(page, 'touchmove', from + step);
  }
}

async function dragOn(page: Page, to: number): Promise<void> {
  await touchAt(page, 'touchmove', to);
}

async function letGo(page: Page, at: number): Promise<void> {
  await touchAt(page, 'touchend', at);
}

function underWhenTaken(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as FingerProbe).underWhenTaken);
}

function swipeOverlay(page: Page) {
  return page.locator('.page-transition--swipe');
}

function overPageOffset(page: Page): Promise<number> {
  return page
    .locator('.page-transition--swipe .page-transition__page--over')
    .evaluate((over) => new DOMMatrixReadOnly(getComputedStyle(over).transform).m41);
}

const FLICK_REST_MS = 100;

async function restLongerThanAFlick(page: Page): Promise<void> {
  const restStartedAt = await page.evaluate(() => performance.now());
  await expect
    .poll(() => page.evaluate(() => performance.now()))
    .toBeGreaterThan(restStartedAt + FLICK_REST_MS);
}

async function countFocusMoves(page: Page): Promise<() => Promise<number>> {
  const focused = await watchFocus(page);
  return async () => (await focused()).length;
}

async function watchFocus(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const probe = window as unknown as { focused: string[] };
    probe.focused = [];
    document.addEventListener(
      'focusin',
      (event) => probe.focused.push((event.target as Element).textContent?.trim() ?? ''),
      { capture: true },
    );
  });
  return () => page.evaluate(() => (window as unknown as { focused: string[] }).focused);
}

function linkToArticle(page: Page) {
  return page.getByRole('main').locator(`a[href="/aktuality/${article.slug}"]`).first();
}

function articleHeading(page: Page) {
  return page.getByRole('heading', { level: 1, name: article.title });
}

async function inTheHomeScreenApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
  });
}

async function publishedArticle(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
  );
}

async function asAdministrator(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('nfnn.donor-session-app', '1'));
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
}

test.describe('Given an administrator in the app on the home screen of a phone who opened Správa from the account sheet over the news', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await inTheHomeScreenApp(page);
    await asAdministrator(page);
    await mockDonorApi(page);
    await publishedArticle(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
    const copied = whenAdministrationCopied(page);
    await openAccountItem(page, 'Správa');
    await expect(page).toHaveURL(/\/sprava$/);
    await copied();
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger takes Správa from the edge, then the news already lies under it as the page starts to move, never an empty screen, and past half the news returns', async ({
    page,
  }) => {
    await takeWithFinger(page, 20);

    await expect(swipeOverlay(page)).toHaveCount(1);
    expect(await underWhenTaken(page)).toBe(LIST_TITLE);
    await dragOn(page, 300);
    await expect.poll(() => overPageOffset(page)).toBeCloseTo(280, 0);
    await letGo(page, 300);

    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when Zpět is pressed again while the first step back still slides, then the second step lands two pages back and no transition stays over it', async ({
    page,
  }) => {
    await page
      .getByRole('navigation', { name: 'Sekce správy' })
      .getByRole('link', { name: /Lidé fondu, správci, zálohy/ })
      .click();
    await expect(page).toHaveURL(/\/sprava\/vice$/);
    await expect(page.locator('.page-transition')).toHaveCount(0);
    await page
      .getByRole('main')
      .getByRole('link', { name: /^Nastavení/ })
      .click();
    await expect(page).toHaveURL(/\/sprava\/nastaveni$/);
    await expect(page.locator('.page-transition')).toHaveCount(0);
    const back = page.getByRole('banner').getByRole('button', { name: 'Zpět' });

    await back.evaluate((button: HTMLElement) => button.click());
    await expect(page.locator('.page-transition--moving')).toHaveCount(1);
    await back.evaluate((button: HTMLElement) => button.click());

    await expect(page).toHaveURL(/\/sprava$/);
    await expect(page.locator('.page-transition')).toHaveCount(0, {
      timeout: TRANSITION_ENDS_WITHIN_MS,
    });
    await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeVisible();
  });

  test('when a finger takes a deeper section of Správa from the edge, then the head of the sheet stands while the section moves', async ({
    page,
  }) => {
    await page
      .getByRole('navigation', { name: 'Sekce správy' })
      .getByRole('link', { name: /Lidé fondu, správci, zálohy/ })
      .click();
    await expect(page).toHaveURL(/\/sprava\/vice$/);
    await expect(page.locator('.page-transition')).toHaveCount(0);

    await takeWithFinger(page, 20);
    await dragOn(page, 220);

    await expect.poll(() => overPageOffset(page)).toBeCloseTo(200, 0);
    const heads = swipeOverlay(page).locator('.page-transition__bar app-sheet-head');
    await expect(heads).toHaveCount(2);
    for (const head of await heads.all()) {
      expect((await head.boundingBox())?.x).toBe(0);
    }
    await letGo(page, 220);
  });
});

test.describe('Given an administrator who opened the app on the home screen of a phone straight on Správa, so nothing of the page before it is kept', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await inTheHomeScreenApp(page);
    await asAdministrator(page);
    await mockDonorApi(page);
    const copied = whenAdministrationCopied(page);
    await page.goto('/sprava');
    await copied();
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger drags Správa from the edge, then the page starts to move only over the landing drawn under it, never over an empty ground, and past half the landing opens', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const probe = window as unknown as { underWhenMoved: string | null };
      probe.underWhenMoved = null;
      const watch = new MutationObserver(() => {
        const over = document.querySelector<HTMLElement>(
          '.page-transition--swipe .page-transition__page--over',
        );
        if (over !== null && over.style.transform !== '') {
          watch.disconnect();
          probe.underWhenMoved =
            document
              .querySelector('.page-transition--swipe .page-transition__page--under h1')
              ?.textContent?.trim() ?? '';
        }
      });
      watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
    });

    await takeWithFinger(page, 20);
    await expect(
      swipeOverlay(page).locator('.page-transition__page--under h1', { hasText: 'Nová naděje' }),
    ).toHaveCount(1);
    await dragOn(page, 300);
    await expect.poll(() => overPageOffset(page)).toBeCloseTo(280, 0);

    expect(
      await page.evaluate(
        () => (window as unknown as { underWhenMoved: string | null }).underWhenMoved,
      ),
    ).toBe('Nová naděje');
    await letGo(page, 300);
    await expect(page).toHaveURL('/');
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });
});

test.describe('Given the app on the home screen of a phone with an article opened from the news', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await inTheHomeScreenApp(page);
    await mockDonorApi(page);
    await publishedArticle(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
    await linkToArticle(page).click();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(articleHeading(page)).toBeFocused();
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger takes the article back past half and lets go, then the news returns with focus on the link the visitor left by', async ({
    page,
  }) => {
    await takeWithFinger(page, 20);
    await dragOn(page, 300);
    await letGo(page, 300);

    await expect(page).toHaveURL('/aktuality');
    await expect(linkToArticle(page)).toBeFocused();
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger takes the article a little way and rests before letting go, then the article stays and keeps its focus, which never moved meanwhile', async ({
    page,
  }) => {
    const focusMoves = await countFocusMoves(page);

    await takeWithFinger(page, 20);
    await restLongerThanAFlick(page);
    await letGo(page, 120);

    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(articleHeading(page)).toBeFocused();
    expect(await focusMoves()).toBe(0);
  });
});

test.describe('Given the app on the home screen of a phone opened straight on an article, so the news is drawn under the finger', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await inTheHomeScreenApp(page);
    await mockDonorApi(page);
    await publishedArticle(page);
    await page.goto(`/aktuality/${article.slug}`);
    await expect(articleHeading(page)).toBeVisible();
    await articleHeading(page).focus();
  });

  test('when a finger takes the article while the news is drawn under it and the swipe is called off, then the drawing took no focus and the article keeps it', async ({
    page,
  }) => {
    const focused = await watchFocus(page);

    await takeWithFinger(page, 20);
    await expect(
      swipeOverlay(page).locator('.page-transition__page--under h1', { hasText: LIST_TITLE }),
    ).toHaveCount(1);
    await restLongerThanAFlick(page);
    await letGo(page, 120);

    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(articleHeading(page)).toBeFocused();
    expect(new Set(await focused())).toEqual(new Set([article.title]));
  });

  test('when a finger takes the article back past half and lets go, then the news, never shown before, opens with focus on its heading', async ({
    page,
  }) => {
    await takeWithFinger(page, 20);
    await expect(
      swipeOverlay(page).locator('.page-transition__page--under h1', { hasText: LIST_TITLE }),
    ).toHaveCount(1);
    await dragOn(page, 300);
    await letGo(page, 300);

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeFocused();
  });
});

test.describe('Given the app on the home screen of a phone with an article opened from the news, for a visitor who asks for less motion', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });

  test.beforeEach(async ({ page }) => {
    await inTheHomeScreenApp(page);
    await mockDonorApi(page);
    await publishedArticle(page);
    await page.goto('/aktuality');
    await linkToArticle(page).click();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(articleHeading(page)).toBeFocused();
  });

  test('when a finger swipes the article back past half, then nothing follows the finger, and on letting go the news returns with focus on the link the visitor left by', async ({
    page,
  }) => {
    await takeWithFinger(page, 20);
    await dragOn(page, 300);
    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await letGo(page, 300);

    await expect(page).toHaveURL('/aktuality');
    await expect(linkToArticle(page)).toBeFocused();
  });
});

test.describe('Given a visitor in the app on the home screen of a phone with the account sheet open over an article', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await inTheHomeScreenApp(page);
    await mockDonorApi(page);
    await publishedArticle(page);
    await page.goto('/aktuality');
    await page.getByRole('link', { name: article.title }).click();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(page.locator('.page-transition')).toHaveCount(0);
    await page
      .getByRole('banner')
      .getByRole('button', { name: /^(Účet|Přihlásit)/ })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('when a finger swipes from the edge over the sheet, then nothing moves, the sheet stays open and the article stays', async ({
    page,
  }) => {
    await takeWithFinger(page, 20);
    await dragOn(page, 300);

    await expect(swipeOverlay(page)).toHaveCount(0);
    await letGo(page, 300);
    await waitWhileNothingMayHappen(page, SETTLED_MS);

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
  });
});

test.describe('Given the app on the home screen of an iPad held across with an article opened from the news', () => {
  test.use({
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await inTheHomeScreenApp(page);
    await mockDonorApi(page);
    await publishedArticle(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: article.title }).click();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
    await expect(page.locator('.page-transition, .page-fade')).toHaveCount(0);
  });

  test('when a finger takes the article from the edge, then only the content area follows it over the news while the header and the tab bar stand, and past half the news returns', async ({
    page,
  }) => {
    await takeWithFinger(page, 20);
    await dragOn(page, 700);

    expect(await underWhenTaken(page)).toBe(LIST_TITLE);
    const header = await page.locator('.page-layer app-header header').first().boundingBox();
    const area = await swipeOverlay(page).boundingBox();
    expect(area?.y).toBeGreaterThanOrEqual((header?.y ?? 0) + (header?.height ?? 0) - 1);
    const tabBar = await page.locator('.page-layer app-tab-bar .tab-bar').first().boundingBox();
    expect(tabBar).not.toBeNull();
    expect((area?.y ?? 0) + (area?.height ?? 0)).toBeLessThanOrEqual((tabBar?.y ?? 0) + 1);
    for (const copied of await swipeOverlay(page).locator('app-tab-bar .tab-bar').all()) {
      await expect(copied).toBeHidden();
    }
    await expect.poll(() => overPageOffset(page)).toBeCloseTo(680, 0);
    await letGo(page, 700);

    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });
});

test.describe('Given an administrator in the app on the home screen of an iPad held across on Platby z banky, a section of the side navigation', () => {
  test.use({
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await inTheHomeScreenApp(page);
    await asAdministrator(page);
    await mockDonorApi(page);
    await openUnlockedAdministrationPage(page, '/sprava/platby', 'Platby z banky');
    await expect(page.locator('.page-transition, .page-fade')).toHaveCount(0);
  });

  test('when a finger swipes across its content, then nothing moves and the payments stay, as choosing another section is no step', async ({
    page,
  }) => {
    const content = await page.locator('.admin-content').boundingBox();
    const from = (content?.x ?? 0) + 20;
    await takeWithFinger(page, from);
    await dragOn(page, from + 600);

    await expect(swipeOverlay(page)).toHaveCount(0);
    await letGo(page, from + 600);
    await waitWhileNothingMayHappen(page, SETTLED_MS);

    await expect(page).toHaveURL('/sprava/platby');
    await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeVisible();
  });
});
