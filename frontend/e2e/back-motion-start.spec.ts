import type { Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
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

function photoPng(width: number, height: number): Buffer {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      rows[at] = (x * 7 + y) % 256;
      rows[at + 1] = (y * 5) % 256;
      rows[at + 2] = (x ^ y) % 256;
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    const check = Buffer.alloc(4);
    check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PHOTO_PNG = photoPng(960, 600);
const MARKED_NEWS = 'Zpráva 7';
const LOOK_BACK_TITLE = 'Ohlédnutí za rokem 2025';

function newsWithPhoto(index: number): Record<string, unknown> {
  const photoId = `0199f3e0-0000-7000-8000-00000000e5${String(index).padStart(2, '0')}`;
  return {
    id: `0199f3e0-0000-7000-8000-00000000e4${String(index).padStart(2, '0')}`,
    slug: `zprava-${index}`,
    title: `Zpráva ${index}`,
    tag: null,
    perex: 'Krátce o tom, co se u nás stalo, aby bylo v seznamu co číst.',
    body: 'Text.',
    coverImage: { id: photoId, url: `/api/content/media/${photoId}`, alt: null },
    publishedOn: `2026-10-${String(20 - index).padStart(2, '0')}`,
    createdAt: '2026-10-01T09:00:00Z',
    updatedAt: '2026-10-01T09:00:00Z',
    signer: null,
    lookBackYear: null,
    live: true,
  };
}

const NEWS_WITH_PHOTOS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(newsWithPhoto).concat({
  ...newsWithPhoto(10),
  slug: 'ohlednuti-za-rokem-2025',
  title: LOOK_BACK_TITLE,
  lookBackYear: 2025,
});

const STORY_OF_2025 = {
  id: '0199f3e0-0000-7000-8000-00000000e601',
  slug: 'pribeh-roku-2025',
  title: 'Příběh roku 2025',
  year: 2025,
  category: 'CHILDREN',
  tag: 'Pomůcky',
  perex: 'Příběh, který se dá přečíst.',
  body: 'Text příběhu.',
  coverImage: null,
  publishedOn: '2025-10-15',
  createdAt: '2025-09-19T09:00:00Z',
  updatedAt: '2025-10-01T07:30:00Z',
  live: true,
};

interface CopyOfTheNews {
  readonly at: number;
  readonly both: boolean;
  readonly overlay: boolean;
  readonly held: boolean;
  readonly leavingOffset: number | null;
  readonly copyTop: number | null;
  readonly copyMarkTop: number | null;
  readonly copyPhotosInView: number;
  readonly copyPhotosNotDrawn: number;
  readonly liveMarkTop: number | null;
  readonly liveScrollY: number;
}

interface ReturnSeen {
  readonly frames: CopyOfTheNews[];
  placed: CopyOfTheNews | null;
  done: boolean;
}

declare global {
  interface Window {
    nfnnReturnSeen?: ReturnSeen;
  }
}

function measuresFrames(page: Page): boolean {
  return page.context().browser()?.browserType().name() === 'chromium';
}

async function publishedNewsWithPhotos(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PHOTO_PNG }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({
        json: {
          items: NEWS_WITH_PHOTOS,
          page: 0,
          size: 10,
          total: NEWS_WITH_PHOTOS.length,
          hasMore: false,
        },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/news/'),
    (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').pop();
      const found = NEWS_WITH_PHOTOS.find((item) => item['slug'] === slug);
      return found ? route.fulfill({ json: found }) : route.fallback();
    },
  );
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({
        json: { items: [STORY_OF_2025], page: 0, size: 50, total: 1, hasMore: false },
      }),
  );
}

function tab(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Hlavní sekce' }).getByRole('link', { name });
}

function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

async function newsWithPhotosScrolledAndLeftForAnotherTab(page: Page): Promise<number> {
  await page.goto('/aktuality');
  const marked = page.getByRole('main').getByRole('link', { name: MARKED_NEWS }).first();
  await marked.scrollIntoViewIfNeeded();
  await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLImageElement>('.page-layer main img')).map(
            (photo) => {
              const box = photo.getBoundingClientRect();
              return {
                onScreen: box.bottom > 0 && box.top < innerHeight,
                drawn: photo.complete && photo.naturalWidth > 0,
                src: photo.currentSrc || photo.src,
              };
            },
          ),
        ),
      { message: 'photos of the news, none of them drawn on screen' },
    )
    .toContainEqual(expect.objectContaining({ onScreen: true, drawn: true }));
  const listTop = await scrollY(page);
  await tab(page, 'Pomáháme').click();
  await expect(page).toHaveURL('/projekty');
  await page.getByRole('link', { name: LOOK_BACK_TITLE }).click();
  await expect(page).toHaveURL('/aktuality/ohlednuti-za-rokem-2025');
  await expect(page.getByRole('heading', { level: 1, name: LOOK_BACK_TITLE })).toBeVisible();
  await expect(page.locator('.page-transition')).toHaveCount(0);
  return listTop;
}

async function watchTheReturn(page: Page): Promise<void> {
  await page.evaluate((marked) => {
    const seen: ReturnSeen = { frames: [], placed: null, done: false };
    window.nfnnReturnSeen = seen;
    const markIn = (root: Element | null): HTMLElement | null =>
      Array.from(root?.querySelectorAll<HTMLElement>('.news-link') ?? []).find(
        (link) => (link.textContent ?? '').trim() === marked,
      ) ?? null;
    const shown = (): CopyOfTheNews => {
      const overlay = document.querySelector('.page-transition');
      const over = overlay?.querySelector('.page-transition__page--over') ?? null;
      const under = overlay?.querySelector('.page-transition__page--under') ?? null;
      const scroller = under?.querySelector('.page-transition__scroller') ?? null;
      const photos = Array.from(under?.querySelectorAll<HTMLImageElement>('img') ?? []).filter(
        (photo) => {
          const box = photo.getBoundingClientRect();
          return box.bottom > 0 && box.top < innerHeight;
        },
      );
      return {
        at: performance.now(),
        both: over !== null && under !== null,
        overlay: overlay !== null,
        held: overlay?.classList.contains('page-transition--held') ?? false,
        leavingOffset:
          over === null ? null : new DOMMatrixReadOnly(getComputedStyle(over).transform).m41,
        copyTop: scroller === null ? null : Math.round(scroller.scrollTop),
        copyMarkTop: markIn(under)?.getBoundingClientRect().top ?? null,
        copyPhotosInView: photos.length,
        copyPhotosNotDrawn: photos.filter((photo) => !(photo.complete && photo.naturalWidth > 0))
          .length,
        liveMarkTop:
          overlay === null
            ? (markIn(document.querySelector('.page-layer'))?.getBoundingClientRect().top ?? null)
            : null,
        liveScrollY: Math.round(window.scrollY),
      };
    };
    const placing = new MutationObserver(() => {
      const now = shown();
      if (now.both) {
        placing.disconnect();
        seen.placed = now;
      }
    });
    placing.observe(document.body, { childList: true, subtree: true });
    let after = 0;
    const look = (): void => {
      const now = shown();
      seen.frames.push(now);
      if (!now.overlay && seen.placed !== null && ++after > 2) {
        seen.done = true;
        return;
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }, MARKED_NEWS);
}

async function returnSeen(page: Page): Promise<ReturnSeen> {
  await expect.poll(() => page.evaluate(() => window.nfnnReturnSeen?.done ?? false)).toBe(true);
  return page.evaluate(() => window.nfnnReturnSeen!);
}

function expectTheCopyWhereTheyLeftIt(copy: CopyOfTheNews, listTop: number, when: string): void {
  expect(
    { scrolledTo: copy.copyTop, marked: copy.copyMarkTop !== null },
    `the copy of the news ${when}, against where they left the news`,
  ).toEqual({ scrolledTo: listTop, marked: true });
  expect(copy.copyPhotosInView, `the copy of the news showed no photo ${when}`).toBeGreaterThan(0);
  expect(copy.copyPhotosNotDrawn, `photos of the copy of the news not drawn ${when}`).toBe(0);
}

test.describe('Given the app on the home screen of a phone with the news and their photos scrolled far down, left for an article of the news opened from the Pomáháme tab, so that no copy of the news is kept', () => {
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
    await publishedNewsWithPhotos(page);
  });

  test('when Zpět is pressed, then both copies are drawn at rest before the news moves, the first frame it moves in shows the news where they left it with its photos drawn, and the step ends on the live news without a jump', async ({
    page,
  }) => {
    const listTop = await newsWithPhotosScrolledAndLeftForAnotherTab(page);
    await watchTheReturn(page);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    const { frames, placed } = await returnSeen(page);
    expect(placed, 'no copy of the news joined the cover').not.toBeNull();
    expect(
      { held: placed!.held, leavingOffset: placed!.leavingOffset },
      'the cover as the copy of the news joined it',
    ).toEqual({ held: true, leavingOffset: 0 });
    expectTheCopyWhereTheyLeftIt(placed!, listTop, 'as it joined the cover');
    if (measuresFrames(page)) {
      const placedAt = frames.findIndex((frame) => frame.both);
      const movedAt = frames.findIndex((frame) => Math.abs(frame.leavingOffset ?? 0) > 1);
      expect(placedAt, 'no frame showed both copies').toBeGreaterThanOrEqual(0);
      expect(
        frames[placedAt].leavingOffset,
        'the frame that first showed both copies had already moved them',
      ).toBe(0);
      expect(movedAt, 'the page never moved').toBeGreaterThan(placedAt);
      expectTheCopyWhereTheyLeftIt(frames[movedAt], listTop, 'in the first moving frame');
    }
    const ended = frames.find((frame) => !frame.overlay && frame.at > placed!.at)!;
    expect(ended.liveScrollY, 'the live news after the step, against where they left it').toBe(
      listTop,
    );
    expect(
      Math.abs(ended.liveMarkTop! - placed!.copyMarkTop!),
      'px the news jumped between the copy of the step and the live page',
    ).toBeLessThanOrEqual(1);
    await expect(page).toHaveURL('/aktuality');
  });
});
