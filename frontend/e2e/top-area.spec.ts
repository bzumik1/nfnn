import { Locator, Page } from '@playwright/test';
import { BREAKPOINTS } from '../src/app/core/layout/breakpoints';
import { mockPublicContent } from './baseline/screen-mocks';
import { mockDonorApi, rememberedDonorSession } from './donor-session';
import { fingerAlong } from './finger';
import { expect, test, testWithoutBrowser } from './fixtures';
import {
  bandUnderClockOutOfStep,
  barsThatChanged,
  blurMissingUnderHeader,
  blurOutOfStep,
  Rgb,
  ScreenFrame,
  groundOutOfStep,
  scrollbarOutOfStep,
  TopAreaFrame,
  topAreaFramesWhile,
  topAreaWhile,
  veilJumps,
  veilStepsBack,
} from './top-area';

const WHITE: Rgb = [255, 255, 255];
const NAVY: Rgb = [10, 15, 40];
const GREY: Rgb = [100, 116, 139];
const FULL_BACKDROP = 0.6;
const WEAKEST_BACKDROP = 0.5;
const BLUR_REPORTED = /blur does not show|blur shows at/;
const GLASS = { name: 'account-button', blur: 'blur(24px)', fill: '255 255 255 0.94', shown: true };

function veiled(base: Rgb, strength: number): Rgb {
  const under = (channel: number): number =>
    Math.round(base[channel] * (1 - strength) + NAVY[channel] * strength);
  return [under(0), under(1), under(2)];
}

function screens(measured: [number, number][]): ScreenFrame[] {
  return measured.map(([lightness, edges]) => ({ lightness, edges }));
}

const BLURRED_SCREENS: [number, number][] = [
  [253, 2.65],
  [209.5, 1.57],
  [175, 0.89],
  [141.9, 0.4],
  [128.3, 0.25],
  [120.2, 0.17],
  [111.4, 0.11],
];

function planted(strengths: (number | null)[], more: Partial<TopAreaFrame> = {}): TopAreaFrame[] {
  return strengths.map((veil, index) => ({
    at: (index * 1000) / 60,
    readAt: (index * 1000) / 60,
    veil: veil === null ? null : veil * FULL_BACKDROP,
    blur: veil ?? 0,
    tint: veil === null ? null : NAVY,
    ground: veiled(WHITE, (veil ?? 0) * FULL_BACKDROP),
    track: veiled(WHITE, (veil ?? 0) * FULL_BACKDROP),
    thumb: veiled(GREY, (veil ?? 0) * FULL_BACKDROP),
    bars: [GLASS],
    ...more,
  }));
}

testWithoutBrowser.describe('Given frames of the top of the page planted by hand', () => {
  testWithoutBrowser(
    'when each check reads them, then it reports exactly the frames that are out of step and nothing for frames in step',
    async () => {
      await testWithoutBrowser.step(
        'a backdrop that grows a little in every frame with its blur',
        () => {
          const frames = planted([null, 0, 0.15, 0.4, 0.6, 0.8, 0.95, 1, 1]);

          expect(veilJumps(frames)).toEqual([]);
          expect(blurOutOfStep(frames)).toEqual([]);
          expect(barsThatChanged(frames)).toEqual([]);
          expect(groundOutOfStep(frames)).toEqual([]);
          expect(scrollbarOutOfStep(frames)).toEqual([]);
        },
      );

      await testWithoutBrowser.step('a backdrop gone for one frame and back', () => {
        expect(veilJumps(planted([1, 1, 0, 1, 1]))).toEqual([
          'the backdrop goes from 100 % to 0 % of its strength in frame 2, 17 ms after the previous one',
          'the backdrop goes from 0 % to 100 % of its strength in frame 3, 17 ms after the previous one',
        ]);
      });

      await testWithoutBrowser.step('a backdrop cut in one frame', () => {
        expect(veilJumps(planted([1, 1, null, null]))).toEqual([
          'the backdrop goes from 100 % to 0 % of its strength in frame 2, 17 ms after the previous one',
        ]);
      });

      await testWithoutBrowser.step('two frames dropped while the backdrop left', () => {
        const frames = planted([1, 0.9, 0.1, 0, null]).map((frame, index) =>
          index < 2
            ? frame
            : { ...frame, at: frame.at + 2000 / 60, readAt: frame.readAt + 2000 / 60 },
        );

        expect(veilJumps(frames)).toEqual([]);
      });

      await testWithoutBrowser.step(
        'a backdrop read late in a frame stamped 17 ms after the previous one',
        () => {
          const inStep = planted([0, 0.6, 1]);
          const readLate = inStep.map((frame, index) =>
            index === 0 ? frame : { ...frame, readAt: frame.readAt + 7000 / 60 },
          );

          expect(veilJumps(inStep)).toEqual([
            'the backdrop goes from 0 % to 60 % of its strength in frame 1, 17 ms after the previous one',
          ]);
          expect(veilJumps(readLate)).toEqual([]);
        },
      );

      await testWithoutBrowser.step('a blur missing under half a backdrop', () => {
        const frames = planted([0, 0.5, 1]).map((frame, index) =>
          index === 1 ? { ...frame, blur: 0 } : frame,
        );

        expect(blurOutOfStep(frames)).toEqual([
          'the backdrop declares its blur at 0 % under a backdrop at 50 % of its strength in frame 1',
        ]);
      });

      await testWithoutBrowser.step('a bar that loses its blur for a frame', () => {
        const frames = planted([0, 0.5, 1]).map((frame, index) =>
          index === 1 ? { ...frame, bars: [{ ...GLASS, blur: 'none' }] } : frame,
        );

        expect(barsThatChanged(frames)).toEqual([
          'account-button: blur blur(24px) → none in frame 1',
          'account-button: blur none → blur(24px) in frame 2',
        ]);
      });

      await testWithoutBrowser.step('a ground that stays dark after the backdrop has gone', () => {
        const frames = planted([1, 0.5, 0, null, null]).map((frame, index) =>
          index < 4 ? { ...frame, ground: [108, 111, 126] as const } : frame,
        );

        expect(groundOutOfStep(frames)).toEqual([
          'the ground beside the backdrop is #6c6f7e where the page under it is #b6b7bf in frame 1',
          'the ground beside the backdrop is #6c6f7e where the page under it is #ffffff in frame 2',
          'the ground beside the backdrop is #6c6f7e where the page under it is #ffffff in frame 3',
        ]);
      });

      await testWithoutBrowser.step('a scrollbar track and thumb dark before the backdrop', () => {
        const frames = planted([null, 0, 0.5, 1]).map((frame, index) =>
          index === 0
            ? frame
            : { ...frame, track: veiled(WHITE, FULL_BACKDROP), thumb: veiled(GREY, FULL_BACKDROP) },
        );

        expect(scrollbarOutOfStep(frames)).toEqual([
          'the scrollbar track beside the backdrop is #6c6f7e where the page under it is #ffffff in frame 1',
          'the scrollbar thumb beside the backdrop is #2e3750 where the page under it is #64748b in frame 1',
          'the scrollbar track beside the backdrop is #6c6f7e where the page under it is #b6b7bf in frame 2',
          'the scrollbar thumb beside the backdrop is #2e3750 where the page under it is #49566d in frame 2',
        ]);
      });

      await testWithoutBrowser.step(
        'a scrollbar that keeps the browser’s own colours at rest',
        () => {
          const frames = planted([null, 0, 0.5, 1, null]).map((frame) =>
            frame.veil === null || frame.veil > 0
              ? { ...frame, track: null, thumb: null }
              : { ...frame, thumb: GREY },
          );

          expect(scrollbarOutOfStep(frames)).toEqual([
            'the scrollbar thumb switches from the browser’s own colour to #64748b in frame 1',
            'the scrollbar thumb switches back to the browser’s own colour in frame 2',
            'the scrollbar keeps the browser’s own colours beside a backdrop at 30 % in frame 2',
            'the scrollbar keeps the browser’s own colours beside a backdrop at 60 % in frame 3',
          ]);
        },
      );

      await testWithoutBrowser.step('screencast frames whose blur comes with the backdrop', () => {
        expect(
          blurMissingUnderHeader({ frames: planted([null, 1]), screens: screens(BLURRED_SCREENS) }),
        ).toEqual([]);
        expect(veilStepsBack(planted([1, 1, null, null]))).toEqual([]);
      });

      await testWithoutBrowser.step('a backdrop that blinks while it grows or fades', () => {
        expect(veilStepsBack(planted([0, 0.5, 0, 1]))).toEqual([
          'the backdrop goes from 50 % to 0 % of its strength in frame 2, 17 ms after the previous one',
        ]);
        expect(veilStepsBack(planted([1, 0.5, 1, 0]))).toEqual([
          'the backdrop goes from 50 % to 100 % of its strength in frame 2, 17 ms after the previous one',
        ]);
      });

      await testWithoutBrowser.step('screencast frames whose backdrop never blurs', () => {
        const unblurred = screens([
          [253, 2.65],
          [209.5, 2.18],
          [175, 1.8],
          [134, 1.35],
          [111.4, 1.1],
        ]);

        expect(blurMissingUnderHeader({ frames: planted([null, 1]), screens: unblurred })).toEqual([
          'the header band keeps 103 % of its edges under the whole backdrop in screencast frame 4, so its blur does not show',
        ]);
      });

      await testWithoutBrowser.step(
        'screencast frames that never blur, with a little noise',
        () => {
          const noisy = screens([
            [253, 2.65],
            [209.5, 2.18],
            [175, 1.8],
            [134, 1.35],
            [111.4, 1.0],
          ]);

          expect(blurMissingUnderHeader({ frames: planted([null, 1]), screens: noisy })).toEqual([
            'the header band keeps 94 % of its edges under the whole backdrop in screencast frame 4, so its blur does not show',
          ]);
        },
      );

      await testWithoutBrowser.step('a first frame still blurred before the blur goes', () => {
        const closing = screens([
          [111.4, 0.11],
          [111.4, 1.1],
          [175, 1.8],
          [253, 2.65],
        ]);

        expect(blurMissingUnderHeader({ frames: planted([1, null]), screens: closing })).toEqual([
          'the header band keeps 103 % of its edges under the whole backdrop in screencast frame 1, so its blur does not show',
        ]);
      });

      await testWithoutBrowser.step('a screencast frame that loses the blur halfway', () => {
        const lost = screens(
          BLURRED_SCREENS.map(([lightness, edges], index) => [
            lightness,
            index === 3 ? 1.41 : edges,
          ]),
        );

        expect(blurMissingUnderHeader({ frames: planted([null, 1]), screens: lost })).toEqual([
          'the blur shows at 0 % of its share under a backdrop at 78 % of its strength in screencast frame 3',
        ]);
        expect(blurMissingUnderHeader({ frames: planted([null, 1]), screens: [] })).toEqual([
          'no screencast frame shows the band under the header',
        ]);
      });

      await testWithoutBrowser.step('a band under the clock that darkens with the backdrop', () => {
        expect(
          bandUnderClockOutOfStep({
            frames: planted([null, 1]),
            screens: screens([
              [255, 0],
              [200, 0],
              [150, 0],
              [111.4, 0],
              [111.4, 0],
            ]),
          }),
        ).toEqual([]);
      });

      await testWithoutBrowser.step('a band under the clock that stays bright', () => {
        expect(
          bandUnderClockOutOfStep({
            frames: planted([null, 1]),
            screens: screens([
              [255, 0],
              [250, 0],
              [248, 0],
              [246, 0],
            ]),
          }),
        ).toEqual(['the band under the clock darkens to 4 % where the backdrop reaches 60 %']);
      });

      await testWithoutBrowser.step(
        'a band under the clock that lightens while the backdrop grows',
        () => {
          expect(
            bandUnderClockOutOfStep({
              frames: planted([null, 1]),
              screens: screens([
                [255, 0],
                [150, 0],
                [230, 0],
                [111.4, 0],
              ]),
            }),
          ).toEqual([
            'the band under the clock goes from 44 % to 10 % of darkening in screencast frame 2, against the backdrop',
          ]);
        },
      );

      await testWithoutBrowser.step('frames that never rest without a backdrop', () => {
        expect(() => groundOutOfStep(planted([1, 1]))).toThrow(
          'no frame without a backdrop to read the resting ground from',
        );
      });
    },
  );
});

function accountButton(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: 'Účet' });
}

function accountSheet(page: Page): Locator {
  return page.locator('app-account-sheet').getByRole('dialog');
}

async function signedInOn(page: Page, path: string): Promise<void> {
  await mockDonorApi(page);
  await mockPublicContent(page);
  await rememberedDonorSession(page);
  await page.goto(path);
  await expect(accountButton(page)).toBeVisible();
}

async function readingTheNews(page: Page): Promise<void> {
  await signedInOn(page, '/aktuality');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function underTheClock(page: Page): Promise<void> {
  await page.addStyleTag({ content: `:root { --safe-area-top: ${STATUS_BAR_PX}px; }` });
}

function opensTheSheet(page: Page): [() => Promise<void>, () => Promise<void>] {
  return [() => accountButton(page).press('Enter'), () => expect(accountSheet(page)).toBeVisible()];
}

function closesTheSheet(page: Page): [() => Promise<void>, () => Promise<void>] {
  return [
    () => page.keyboard.press('Escape'),
    () => expect(page.getByRole('dialog')).toHaveCount(0),
  ];
}

async function pullsTheSheetDown(page: Page): Promise<void> {
  const head = accountSheet(page).getByRole('heading').first();
  const box = await head.boundingBox();
  if (box === null) {
    throw new Error('the account sheet has no heading to pull it by');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await fingerAlong(
    head,
    PULL_DOWNS.map((down) => ({ x, y: y + down })),
    true,
  );
}

function sheetGone(page: Page): () => Promise<void> {
  return () => expect(page.getByRole('dialog')).toHaveCount(0);
}

async function busyJustAfterTheBackdropStarts(page: Page): Promise<void> {
  await page.evaluate((busyMs) => {
    const watch = window as unknown as { nfnnBusySpells: string[] };
    watch.nfnnBusySpells = [];
    const busy = (kind: string): void =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const started = performance.now();
          let spent = 0;
          while (spent < busyMs) {
            spent = performance.now() - started;
          }
          watch.nfnnBusySpells.push(kind);
        }),
      );
    new MutationObserver((records) => {
      for (const { target, attributeName, oldValue } of records) {
        if (!(target instanceof HTMLDialogElement)) {
          continue;
        }
        if (attributeName === 'open' && target.open) {
          busy('opened');
        } else if (
          attributeName === 'class' &&
          target.classList.contains('dialog--leaving') &&
          !(oldValue ?? '').includes('dialog--leaving')
        ) {
          busy('leaving');
        }
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'class'],
      attributeOldValue: true,
    });
  }, BUSY_MS);
}

function busySpells(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { nfnnBusySpells: string[] }).nfnnBusySpells);
}

function whileTheSheetOpens(page: Page): Promise<TopAreaFrame[]> {
  return topAreaFramesWhile(page, ...opensTheSheet(page));
}

function whileTheSheetCloses(page: Page): Promise<TopAreaFrame[]> {
  return topAreaFramesWhile(page, ...closesTheSheet(page));
}

function expectTheBackdropInStep(frames: TopAreaFrame[]): void {
  expect(veilJumps(frames)).toEqual([]);
  expect(blurOutOfStep(frames)).toEqual([]);
  expect(barsThatChanged(frames)).toEqual([]);
}

const STATUS_BAR_PX = 59;
const HOLD_MS = 100;
const BUSY_MS = 120;
const FRAME_START_BEFORE_CHECK_MS = 1;
const PULL_DOWNS = [0, 20, 80, 400];
const CLASSIC_SCROLLBARS_ONLY =
  'an iPhone draws no classic scrollbar beside the backdrop; Safari’s own strips are #1694 and the device checklist';
const SCREENCAST_ONLY =
  'only Chromium gives a screencast; Playwright’s WebKit draws no backdrop blur (#1352), real Safari is #1978';
const PHONE_SIZE_ONLY =
  'the iphone project runs the phone width and reduced motion only, so its CI shard stays within its 30 minutes';

for (const { place, path } of [
  { place: 'reading the news', path: '/aktuality' },
  { place: 'on the landing page with its photo under the header', path: '/' },
]) {
  test.describe(`Given a signed-in donor ${place} on a computer that animates`, () => {
    test.use({
      viewport: { width: 1280, height: 800 },
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });

    test.beforeEach(async ({ page, isMobile }) => {
      test.skip(isMobile, PHONE_SIZE_ONLY);
      await signedInOn(page, path);
    });

    test('when the account sheet opens and closes, then the header band under the backdrop, the header’s controls and what lies under them, blurs and clears with it in every frame of the screencast', async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', SCREENCAST_ONLY);

      const opening = await topAreaWhile(page, ...opensTheSheet(page));
      const closing = await topAreaWhile(page, ...closesTheSheet(page));

      expect(blurMissingUnderHeader(opening)).toEqual([]);
      expect(blurMissingUnderHeader(closing)).toEqual([]);
    });
  });
}

test.describe('Given a signed-in donor reading the news on a computer that animates', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, PHONE_SIZE_ONLY);
    await readingTheNews(page);
  });

  test('when the account sheet opens, then its backdrop grows a little in every frame, declares its blur with it, and the buttons of the header and the tab bar keep their glass', async ({
    page,
  }) => {
    const frames = await whileTheSheetOpens(page);

    expectTheBackdropInStep(frames);
    expect(frames[0].veil).toBeNull();
    expect(frames[frames.length - 1].veil).toBeGreaterThan(WEAKEST_BACKDROP);
  });

  test('when the account sheet closes, then its backdrop fades a little in every frame, declares its blur with it, and the buttons of the header and the tab bar keep their glass', async ({
    page,
  }) => {
    await whileTheSheetOpens(page);

    const frames = await whileTheSheetCloses(page);

    expectTheBackdropInStep(frames);
    expect(frames[0].veil).toBeGreaterThan(WEAKEST_BACKDROP);
    expect(frames[frames.length - 1].veil).toBeNull();
  });

  test('when the backdrop loses its blur as the account sheet starts to close, then the screencast check reports the blur missing', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', SCREENCAST_ONLY);
    await whileTheSheetOpens(page);
    await page.evaluate(() => {
      const dropBlur = (): void =>
        document.querySelectorAll('dialog.dialog--leaving').forEach((dialog) => {
          (dialog as HTMLElement).style.setProperty('backdrop-filter', 'none', 'important');
        });
      new MutationObserver(dropBlur).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    });

    const closing = await topAreaWhile(page, ...closesTheSheet(page));

    const reported = blurMissingUnderHeader(closing);
    expect(reported).not.toEqual([]);
    expect(reported.filter((problem) => !BLUR_REPORTED.test(problem))).toEqual([]);
  });

  test('when a test holds the sampler’s reads back for 100 ms through a planted nfnnLateFrames, then the sampler samples only after the frame callback returns, reads none of the held frames, its frames skip just the hold, and the backdrop raises no false alarm', async ({
    page,
  }) => {
    await page.evaluate((holdMs) => {
      const held = window as unknown as {
        nfnnLateFrames: { until: number; read(reader: FrameRequestCallback): void };
        topAreaFrames: unknown[];
        nfnnGrewInside: number[];
        nfnnHeldBack: boolean;
        nfnnLetGoAt: number | null;
      };
      held.nfnnGrewInside = [];
      held.nfnnHeldBack = false;
      held.nfnnLetGoAt = null;
      held.nfnnLateFrames = {
        until: 0,
        read(reader) {
          const tick = (now: number): void => {
            if (performance.now() < held.nfnnLateFrames.until) {
              held.nfnnHeldBack = true;
              requestAnimationFrame(tick);
            } else {
              if (held.nfnnHeldBack && held.nfnnLetGoAt === null) {
                held.nfnnLetGoAt = now;
              }
              const before = held.topAreaFrames.length;
              reader(now);
              held.nfnnGrewInside.push(held.topAreaFrames.length - before);
            }
          };
          requestAnimationFrame(tick);
        },
      };
      document.addEventListener(
        'keydown',
        () => {
          held.nfnnLateFrames.until = performance.now() + holdMs;
        },
        { capture: true, once: true },
      );
    }, HOLD_MS);

    const frames = await whileTheSheetOpens(page);

    const { grew, letGoAt } = await page.evaluate(() => {
      const held = window as unknown as { nfnnGrewInside: number[]; nfnnLetGoAt: number | null };
      return { grew: held.nfnnGrewInside, letGoAt: held.nfnnLetGoAt };
    });
    expect(grew.length).toBeGreaterThan(0);
    expect(grew.filter((count) => count > 0)).toEqual([]);
    const gaps = frames.slice(1).map((frame, index) => frame.at - frames[index].at);
    const afterHold = frames.findIndex((frame) => frame.at === letGoAt);
    expect(afterHold).toBeGreaterThan(0);
    expect(frames[afterHold].at - frames[afterHold - 1].at).toBe(Math.max(...gaps));
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(HOLD_MS - FRAME_START_BEFORE_CHECK_MS);
    expect(veilJumps(frames)).toEqual([]);
  });

  test('when the account sheet opens and closes, then the ground beside its backdrop and the scrollbar darken and lighten with it', async ({
    page,
  }) => {
    test.fixme(
      true,
      '#1974: the ground and the scrollbar change ahead of the backdrop on opening and only after it on closing',
    );

    const opening = await whileTheSheetOpens(page);
    const closing = await whileTheSheetCloses(page);

    expect(groundOutOfStep(opening)).toEqual([]);
    expect(scrollbarOutOfStep(opening)).toEqual([]);
    expect(groundOutOfStep(closing)).toEqual([]);
    expect(scrollbarOutOfStep(closing)).toEqual([]);
  });

  test('when the donor switches from Světlý to Tmavý in the open account sheet, then the backdrop stays over the page in every frame', async ({
    page,
  }) => {
    test.fixme(true, '#1644: the dialog and its backdrop are hidden for two frames');
    await whileTheSheetOpens(page);
    const appearance = accountSheet(page).getByRole('button', { name: /^Vzhled: / });
    await appearance.press('Enter');
    await expect(appearance).toHaveAccessibleName('Vzhled: Světlý');

    const frames = await topAreaFramesWhile(
      page,
      () => appearance.press('Enter'),
      () => expect(appearance).toHaveAccessibleName('Vzhled: Tmavý'),
    );

    expect(
      frames.map((frame) => frame.veil ?? 0).filter((veil) => veil < WEAKEST_BACKDROP),
    ).toEqual([]);
  });

  test('when the donor opens Můj přehled from the account sheet, then the backdrop at the top, live or its copy where no arriving page covers it, fades a little in every frame', async ({
    page,
  }) => {
    test.fixme(true, '#1646: the dialog and its backdrop are removed in one frame');
    await whileTheSheetOpens(page);

    const frames = await topAreaFramesWhile(
      page,
      () =>
        accountSheet(page)
          .getByRole('link', { name: /Můj přehled/ })
          .press('Enter'),
      () => expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible(),
    );

    expect(veilJumps(frames)).toEqual([]);
  });
});

for (const width of [1280, 390]) {
  test.describe(`Given a signed-in donor reading the news ${width} px wide on a device that asks for less motion`, () => {
    test.use({
      viewport: { width, height: 844 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });

    test.beforeEach(async ({ page, isMobile }) => {
      test.skip(isMobile && width > BREAKPOINTS.phone, PHONE_SIZE_ONLY);
      await readingTheNews(page);
    });

    test('when the account sheet opens and closes, then its short fade or instant change never blinks, it declares its blur all the while, and the glass stays', async ({
      page,
    }) => {
      const opening = await whileTheSheetOpens(page);
      const closing = await whileTheSheetCloses(page);

      for (const frames of [opening, closing]) {
        expect(veilStepsBack(frames)).toEqual([]);
        expect(blurOutOfStep(frames)).toEqual([]);
        expect(barsThatChanged(frames)).toEqual([]);
      }
    });
  });
}

for (const width of [BREAKPOINTS.nav, 390]) {
  test.describe(`Given a signed-in donor reading the news in a window ${width} px wide`, () => {
    test.use({
      viewport: { width, height: 844 },
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });

    test.beforeEach(async ({ page, isMobile }) => {
      test.skip(isMobile, CLASSIC_SCROLLBARS_ONLY);
      await readingTheNews(page);
    });

    test('when the account sheet is open, then the scrollbar beside its backdrop is darkened with it', async ({
      page,
    }) => {
      test.fixme(true, '#1974: below 900 px the strip beside the backdrop is never darkened');

      const opening = await whileTheSheetOpens(page);

      expect(scrollbarOutOfStep(opening)).toEqual([]);
    });

    test('when the account sheet is open, then the ground beside its backdrop is darkened with it', async ({
      page,
    }) => {
      test.skip(
        width < BREAKPOINTS.nav,
        'at phone width the ground is #1972, checked on the phone below',
      );
      test.fixme(true, '#1974: below 900 px the ground beside the backdrop is never darkened');

      const opening = await whileTheSheetOpens(page);

      expect(groundOutOfStep(opening)).toEqual([]);
    });
  });
}

test.describe('Given a signed-in donor on a phone that animates', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });

  test('when the account sheet comes up over the news and goes down again, then its backdrop grows and fades a little in every frame, declares its blur with it, and the button of the header and the tab bar keep their glass', async ({
    page,
  }) => {
    await readingTheNews(page);
    const opening = await whileTheSheetOpens(page);
    const closing = await whileTheSheetCloses(page);

    expectTheBackdropInStep(opening);
    expectTheBackdropInStep(closing);
  });

  test('when the account sheet comes up over the landing page and a pull takes it down, then the photo under the header, above the sheet, blurs and clears with its backdrop in every frame of the screencast', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', SCREENCAST_ONLY);
    await signedInOn(page, '/');
    await underTheClock(page);

    const opening = await topAreaWhile(page, ...opensTheSheet(page));
    const closing = await topAreaWhile(page, () => pullsTheSheetDown(page), sheetGone(page));

    expect(blurMissingUnderHeader(opening)).toEqual([]);
    expect(blurMissingUnderHeader(closing)).toEqual([]);
  });

  test('when the page is busy for a moment just after the account sheet starts to come up and just after a pull lets it go, then the photo under the header still blurs and clears with its backdrop in every frame of the screencast', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', SCREENCAST_ONLY);
    await signedInOn(page, '/');
    await underTheClock(page);
    await busyJustAfterTheBackdropStarts(page);

    const opening = await topAreaWhile(page, ...opensTheSheet(page));
    const closing = await topAreaWhile(page, () => pullsTheSheetDown(page), sheetGone(page));

    expect(await busySpells(page)).toEqual(expect.arrayContaining(['opened', 'leaving']));
    expect(blurMissingUnderHeader(opening)).toEqual([]);
    expect(blurMissingUnderHeader(closing)).toEqual([]);
  });

  test('when the sheet’s backdrop loses its blur as a pull takes it down, then the screencast check reports the blur missing', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', SCREENCAST_ONLY);
    await signedInOn(page, '/');
    await underTheClock(page);
    await page.addStyleTag({
      content: '.dialog--leaving::backdrop { backdrop-filter: none !important; }',
    });
    await whileTheSheetOpens(page);

    const closing = await topAreaWhile(page, () => pullsTheSheetDown(page), sheetGone(page));

    const reported = blurMissingUnderHeader(closing);
    expect(reported).not.toEqual([]);
    expect(reported.filter((problem) => !BLUR_REPORTED.test(problem))).toEqual([]);
  });
});

const NAVY_GROUND_UNDER_NAVY_BACKDROP =
  'the landing’s navy ground moves less than the tolerance under the navy backdrop, so the probe sees no step there';

for (const { place, path } of [
  { place: 'reading the news', path: '/aktuality' },
  { place: 'on the landing page with its photo', path: '/' },
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    const known =
      path === '/' && colorScheme === 'light'
        ? null
        : '#1972: below 900 px html:has(.dialog:modal) never darkens the ground beside the backdrop, the likely cause, unmeasured (#1978)';
    test.describe(`Given a signed-in donor ${place} on a phone in the ${colorScheme} appearance`, () => {
      test.use({
        viewport: { width: 390, height: 844 },
        colorScheme,
        reducedMotion: 'no-preference',
      });

      test.beforeEach(async ({ page }) => {
        await signedInOn(page, path);
      });

      test(`when the account sheet comes up, then the ground of the page, which iOS shows under the clock in the home-screen app, darkens and clears with its backdrop${known === null ? ` (${NAVY_GROUND_UNDER_NAVY_BACKDROP})` : ''}`, async ({
        page,
      }) => {
        test.fail(known !== null, known ?? '');

        const opening = await whileTheSheetOpens(page);
        const closing = await whileTheSheetCloses(page);

        expect(groundOutOfStep(opening)).toEqual([]);
        expect(groundOutOfStep(closing)).toEqual([]);
      });
    });
  }
}

test.describe('Given a signed-in donor on the landing page of a phone in the dark appearance, under a 59 px safe area, as in video 13', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await signedInOn(page, '/');
    await underTheClock(page);
  });

  test('when a tap brings the account sheet up and a pull takes it down, then its backdrop grows and fades a little in every frame, declares its blur with it, and the glass stays', async ({
    page,
  }) => {
    const opening = await topAreaFramesWhile(
      page,
      () => accountButton(page).tap(),
      () => expect(accountSheet(page)).toBeVisible(),
    );
    const closing = await topAreaFramesWhile(
      page,
      () => pullsTheSheetDown(page),
      () => expect(page.getByRole('dialog')).toHaveCount(0),
    );

    expectTheBackdropInStep(opening);
    expectTheBackdropInStep(closing);
  });

  test('when a tap brings the account sheet up and a pull takes it down, then the ground of the page, which iOS shows under the clock in the home-screen app, darkens and clears with its backdrop', async ({
    page,
  }) => {
    test.fail(
      true,
      '#1972: below 900 px html:has(.dialog:modal) never darkens the ground beside the backdrop, the likely cause, unmeasured (#1978)',
    );

    const opening = await topAreaFramesWhile(
      page,
      () => accountButton(page).tap(),
      () => expect(accountSheet(page)).toBeVisible(),
    );
    const closing = await topAreaFramesWhile(page, () => pullsTheSheetDown(page), sheetGone(page));

    expect(groundOutOfStep(opening)).toEqual([]);
    expect(groundOutOfStep(closing)).toEqual([]);
  });

  test('when a tap brings the account sheet up and a pull takes it down, then the page’s own 59 px band darkens and clears with the backdrop in Chromium’s screencast, where the backdrop covers it (what Safari draws under the clock is #1978)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', SCREENCAST_ONLY);

    const opening = await topAreaWhile(
      page,
      () => accountButton(page).tap(),
      () => expect(accountSheet(page)).toBeVisible(),
      'under the clock',
    );
    const closing = await topAreaWhile(
      page,
      () => pullsTheSheetDown(page),
      () => expect(page.getByRole('dialog')).toHaveCount(0),
      'under the clock',
    );

    expect(bandUnderClockOutOfStep(opening)).toEqual([]);
    expect(bandUnderClockOutOfStep(closing)).toEqual([]);
  });
});
