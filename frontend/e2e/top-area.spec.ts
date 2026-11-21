import { Locator, Page } from '@playwright/test';
import { mockPublicContent } from './baseline/screen-mocks';
import { mockDonorApi, rememberedDonorSession } from './donor-session';
import { expect, test } from './fixtures';
import {
  barsThatChanged,
  blurOutOfStep,
  stripOutOfStep,
  TopAreaFrame,
  topAreaFramesWhile,
  veilJumps,
} from './top-area';

const WHITE = [255, 255, 255] as const;
const NAVY = [10, 15, 40] as const;
const WEAKEST_BACKDROP = 0.5;
const GLASS = { name: 'account-button', blur: 'blur(24px)', fill: '255 255 255 0.94', shown: true };

function planted(strengths: (number | null)[], more: Partial<TopAreaFrame> = {}): TopAreaFrame[] {
  return strengths.map((veil, index) => ({
    at: (index * 1000) / 60,
    veil: veil === null ? null : veil * 0.6,
    blur: veil ?? 0,
    tint: veil === null ? null : NAVY,
    ground: WHITE,
    track: null,
    bars: [GLASS],
    ...more,
  }));
}

test.describe('Given frames of a backdrop planted by hand', () => {
  test('when the backdrop grows a little in every frame with its blur, then nothing is reported', () => {
    const frames = planted([null, 0, 0.15, 0.4, 0.6, 0.8, 0.95, 1, 1]);

    expect(veilJumps(frames)).toEqual([]);
    expect(blurOutOfStep(frames)).toEqual([]);
    expect(barsThatChanged(frames)).toEqual([]);
  });

  test('when the backdrop is gone for one frame and comes back, then both steps are reported', () => {
    expect(veilJumps(planted([1, 1, 0, 1, 1]))).toEqual([
      'the backdrop goes from 100 % to 0 % of its strength in frame 2, 17 ms after the previous one',
      'the backdrop goes from 0 % to 100 % of its strength in frame 3, 17 ms after the previous one',
    ]);
  });

  test('when the backdrop is cut in one frame, then the cut is reported', () => {
    expect(veilJumps(planted([1, 1, null, null]))).toEqual([
      'the backdrop goes from 100 % to 0 % of its strength in frame 2, 17 ms after the previous one',
    ]);
  });

  test('when two frames were dropped while the backdrop left, then the longer step is allowed', () => {
    const frames = planted([1, 0.9, 0.1, 0, null]).map((frame, index) =>
      index < 2 ? frame : { ...frame, at: frame.at + 2000 / 60 },
    );

    expect(veilJumps(frames)).toEqual([]);
  });

  test('when the blur is missing under half a backdrop, then that frame is reported', () => {
    const frames = planted([0, 0.5, 1]).map((frame, index) =>
      index === 1 ? { ...frame, blur: 0 } : frame,
    );

    expect(blurOutOfStep(frames)).toEqual([
      'the blur shows at 0 % under a backdrop at 50 % of its strength in frame 1',
    ]);
  });

  test('when a bar loses its blur for a frame, then the loss and the return are reported', () => {
    const frames = planted([0, 0.5, 1]).map((frame, index) =>
      index === 1 ? { ...frame, bars: [{ ...GLASS, blur: 'none' }] } : frame,
    );

    expect(barsThatChanged(frames)).toEqual([
      'account-button: blur blur(24px) → none in frame 1',
      'account-button: blur none → blur(24px) in frame 2',
    ]);
  });

  test('when the ground beside the backdrop stays dark after the backdrop has gone, then those frames are reported', () => {
    const frames = planted([1, 0.5, 0, null, null]).map((frame, index) =>
      index < 4 ? { ...frame, ground: [108, 111, 126] as const } : frame,
    );

    expect(stripOutOfStep(frames)).toEqual([
      'the ground beside the backdrop is #6c6f7e where the page under it is #b6b7bf in frame 1',
      'the ground beside the backdrop is #6c6f7e where the page under it is #ffffff in frame 2',
      'the ground beside the backdrop is #6c6f7e where the page under it is #ffffff in frame 3',
    ]);
  });
});

function accountButton(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: 'Účet' });
}

function accountSheet(page: Page): Locator {
  return page.locator('app-account-sheet').getByRole('dialog');
}

async function readingTheNews(page: Page): Promise<void> {
  await mockDonorApi(page);
  await mockPublicContent(page);
  await rememberedDonorSession(page);
  await page.goto('/aktuality');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(accountButton(page)).toBeVisible();
}

function whileTheSheetOpens(page: Page): Promise<TopAreaFrame[]> {
  return topAreaFramesWhile(
    page,
    () => accountButton(page).press('Enter'),
    () => expect(accountSheet(page)).toBeVisible(),
  );
}

function whileTheSheetCloses(page: Page): Promise<TopAreaFrame[]> {
  return topAreaFramesWhile(
    page,
    () => page.keyboard.press('Escape'),
    () => expect(page.getByRole('dialog')).toHaveCount(0),
  );
}

function expectTheBackdropInStep(frames: TopAreaFrame[]): void {
  expect(veilJumps(frames)).toEqual([]);
  expect(blurOutOfStep(frames)).toEqual([]);
  expect(barsThatChanged(frames)).toEqual([]);
}

test.describe('Given a signed-in donor reading the news on a computer that animates', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await readingTheNews(page);
  });

  test('when the account sheet opens, then its backdrop darkens the top of the page a little in every frame, its blur comes with it, and the buttons of the header and the tab bar keep their glass', async ({
    page,
  }) => {
    const frames = await whileTheSheetOpens(page);

    expectTheBackdropInStep(frames);
    expect(frames[0].veil).toBeNull();
    expect(frames[frames.length - 1].veil).toBeGreaterThan(WEAKEST_BACKDROP);
  });

  test('when the account sheet closes, then its backdrop lightens a little in every frame, its blur goes with it, and the buttons of the header and the tab bar keep their glass', async ({
    page,
  }) => {
    await whileTheSheetOpens(page);

    const frames = await whileTheSheetCloses(page);

    expectTheBackdropInStep(frames);
    expect(frames[0].veil).toBeGreaterThan(WEAKEST_BACKDROP);
    expect(frames[frames.length - 1].veil).toBeNull();
  });

  test('when the account sheet opens and closes, then the ground beside its backdrop, which the strip of the scrollbar shows, darkens and lightens with it', async ({
    page,
  }) => {
    test.fixme(
      true,
      '#1974: the ground and the scrollbar change ahead of the backdrop on opening and only after it on closing',
    );

    const opening = await whileTheSheetOpens(page);
    const closing = await whileTheSheetCloses(page);

    expect(stripOutOfStep(opening)).toEqual([]);
    expect(stripOutOfStep(closing)).toEqual([]);
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

  test('when the donor opens Můj přehled from the account sheet, then the backdrop lightens a little in every frame', async ({
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

test.describe('Given a signed-in donor reading the news on a phone that animates', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await readingTheNews(page);
  });

  test('when the account sheet comes up and goes down again, then its backdrop darkens and lightens the top of the page a little in every frame, its blur with it, and the button of the header and the tab bar keep their glass', async ({
    page,
  }) => {
    const opening = await whileTheSheetOpens(page);
    const closing = await whileTheSheetCloses(page);

    expectTheBackdropInStep(opening);
    expectTheBackdropInStep(closing);
  });
});
