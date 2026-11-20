import type { Page } from '@playwright/test';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';

const FLICK_REST_MS = 100;
const FINGER_Y = 420;
const LIST_TITLE = 'Co je u nás nového';
const BUSY_AS_ON_THE_PHONE_MS = 140;
const SMALL_PART_OF_THE_WAY = 0.2;
const HELD_AT_MOST_MS = 150;

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c031',
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

interface SeenFrame {
  readonly at: number;
  readonly offset: number | null;
  readonly busy: boolean;
}

declare global {
  interface Window {
    nfnnFramesSeen?: SeenFrame[];
    nfnnHoldSeen?: { heldAt: number | null; releasedAt: number | null };
  }
}

type FirstFrameAfter = 'the pages are placed' | 'the finger lifts';

async function recordFramesKeepingTheFirstBusy(page: Page, from: FirstFrameAfter): Promise<void> {
  await page.evaluate(
    ({ from, busyMs }) => {
      const seen: SeenFrame[] = [];
      window.nfnnFramesSeen = seen;
      const offset = (): number | null => {
        const leaving = document.querySelector('.page-transition__page--over');
        return leaving === null
          ? null
          : new DOMMatrixReadOnly(getComputedStyle(leaving).transform).m41;
      };
      const record = (busy: boolean): void => {
        requestAnimationFrame(() => {
          const shown = offset();
          seen.push({ at: performance.now(), offset: shown, busy });
          if (busy) {
            const until = performance.now() + busyMs;
            let now = performance.now();
            while (now < until) {
              now = performance.now();
            }
          }
          if (shown !== null) {
            record(false);
          }
        });
      };
      if (from === 'the finger lifts') {
        window.addEventListener('touchend', () => record(true), { capture: true, once: true });
        return;
      }
      const watch = new MutationObserver((records) => {
        const placed = records.some((change) =>
          Array.from(change.addedNodes).some(
            (node) => node instanceof HTMLElement && node.matches('.page-transition__page--under'),
          ),
        );
        if (placed) {
          watch.disconnect();
          record(true);
        }
      });
      watch.observe(document.body, { childList: true, subtree: true });
    },
    { from, busyMs: BUSY_AS_ON_THE_PHONE_MS },
  );
}

async function firstFrameShownAfterTheBusyOne(page: Page): Promise<number> {
  await expect
    .poll(() => page.evaluate(() => (window.nfnnFramesSeen ?? []).some((frame) => !frame.busy)))
    .toBe(true);
  const seen = await page.evaluate(() => window.nfnnFramesSeen ?? []);
  const shown = seen.find((frame) => !frame.busy);
  expect(shown?.offset).not.toBeNull();
  return shown!.offset!;
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

function leavingOffset(page: Page): Promise<number> {
  return page
    .locator('.page-transition--swipe .page-transition__page--over')
    .evaluate((over) => Math.round(new DOMMatrixReadOnly(getComputedStyle(over).transform).m41));
}

async function articleHeldBy(page: Page, finger: number): Promise<void> {
  const start = 30;
  const steps = 10;
  await touch(page, 'touchstart', [start]);
  await touch(
    page,
    'touchmove',
    Array.from({ length: steps }, (_, step) => start + ((finger - start) * (step + 1)) / steps),
  );
  await expect(page.locator('.page-transition--swipe .page-transition__page--under h1')).toHaveText(
    LIST_TITLE,
  );
  await expect.poll(() => leavingOffset(page)).toBe(finger - start);
  await restLongerThanAFlick(page);
}

async function openArticleFromList(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await page.getByRole('link', { name: article.title }).click();
  await expect(page).toHaveURL(`/aktuality/${article.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
  await expect(page.locator('.page-transition')).toHaveCount(0);
}

async function articleOpenedFromTheNews(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
  });
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
  await openArticleFromList(page);
}

async function watchTheHoldWithoutFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen = { heldAt: null as number | null, releasedAt: null as number | null };
    window.nfnnHoldSeen = seen;
    const watch = new MutationObserver((records) => {
      for (const record of records) {
        const overlay = record.target;
        if (
          !(overlay instanceof HTMLElement) ||
          !overlay.classList.contains('page-transition--moving')
        ) {
          continue;
        }
        if (overlay.classList.contains('page-transition--held')) {
          seen.heldAt ??= performance.now();
        } else if (seen.heldAt !== null) {
          seen.releasedAt = performance.now();
          watch.disconnect();
          return;
        }
      }
    });
    watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.requestAnimationFrame = () => 0;
  });
}

function width(page: Page): number {
  return page.viewportSize()!.width;
}

test.describe('Given the app on the home screen of a phone with an article opened from the news, whose next frame keeps the phone busy as long as drawing the placed pages does', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit in CI gives the first frame after a change only after 250 to 900 ms and then about every 100 ms, the case without frames of condition 1 of decision R, where the held motion goes on the clock; the start of the motion in WebKit is checked by the frame-by-frame measurement on the simulator',
  );
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(({ page }) => articleOpenedFromTheNews(page));

  test('when Zpět is pressed, then the first frame shown after the busy one shows the article at the start of its way off, not in its middle', async ({
    page,
  }) => {
    await recordFramesKeepingTheFirstBusy(page, 'the pages are placed');

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    const shown = await firstFrameShownAfterTheBusyOne(page);
    expect(shown).toBeLessThanOrEqual(width(page) * SMALL_PART_OF_THE_WAY);
    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger drags the article past half the width and lets go, then the first frame shown after the busy one shows the article where the finger left it, not further on its way', async ({
    page,
  }) => {
    const letGoAt = 220;
    await articleHeldBy(page, 30 + letGoAt);
    await recordFramesKeepingTheFirstBusy(page, 'the finger lifts');

    await touch(page, 'touchend', [30 + letGoAt]);

    const shown = await firstFrameShownAfterTheBusyOne(page);
    expect(shown - letGoAt).toBeLessThanOrEqual((width(page) - letGoAt) * SMALL_PART_OF_THE_WAY);
    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });

  test('when a finger drags the article a short way and lets go, then the first frame shown after the busy one shows the article where the finger left it, not already back', async ({
    page,
  }) => {
    const letGoAt = 110;
    await articleHeldBy(page, 30 + letGoAt);
    await recordFramesKeepingTheFirstBusy(page, 'the finger lifts');

    await touch(page, 'touchend', [30 + letGoAt]);

    const shown = await firstFrameShownAfterTheBusyOne(page);
    expect(letGoAt - shown).toBeLessThanOrEqual(letGoAt * SMALL_PART_OF_THE_WAY);
    await expect(page.locator('.page-transition')).toHaveCount(0);
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
  });
});

test.describe('Given the app on the home screen of a phone with an article opened from the news, whose browser then gives no more animation frames', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(({ page }) => articleOpenedFromTheNews(page));

  test('when Zpět is pressed, then the step back lets its held motion go by the page clock within the duration of a quick change all the same', async ({
    page,
  }) => {
    await watchTheHoldWithoutFrames(page);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    await expect
      .poll(() => page.evaluate(() => window.nfnnHoldSeen?.releasedAt ?? null))
      .not.toBeNull();
    const hold = await page.evaluate(() => window.nfnnHoldSeen!);
    expect(hold.releasedAt! - hold.heldAt!).toBeLessThanOrEqual(HELD_AT_MOST_MS);
    await expect(page).toHaveURL('/aktuality');
    await expect(page.locator('.page-transition')).toHaveCount(0);
  });
});
