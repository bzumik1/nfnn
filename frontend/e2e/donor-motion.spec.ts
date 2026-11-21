import { Locator, Page } from '@playwright/test';
import {
  longUnusedDevices,
  mockDonorApi,
  openDonorSection,
  signedInDevices,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';
import { EdgeSample, jumpsOfTheEdges } from './segmented';

interface Move {
  readonly on: string;
  readonly properties: readonly string[];
  readonly duration: number;
}

const MOVING = new Set(['transform', 'translate', 'scale', 'rotate']);
const SIZING = new Set(['grid-template-rows']);
const INSTANT_MS = 1;

async function recordMoves(page: Page, card: string): Promise<void> {
  await page.evaluate((card) => {
    const moves: Move[] = [];
    const frameKeys = new Set(['offset', 'computedOffset', 'easing', 'composite']);
    (window as unknown as { recordedMoves: Move[] }).recordedMoves = moves;
    const record = (target: EventTarget | null, animation: Animation | undefined) => {
      if (!(target instanceof Element) || animation === undefined || !target.closest(card)) {
        return;
      }
      const effect = animation.effect as KeyframeEffect | null;
      const properties =
        animation instanceof CSSTransition
          ? [animation.transitionProperty]
          : (effect?.getKeyframes() ?? []).flatMap((frame) =>
              Object.keys(frame).filter((key) => !frameKeys.has(key)),
            );
      moves.push({
        on: target.className,
        properties: [...new Set(properties)],
        duration: Number(effect?.getComputedTiming().duration ?? 0),
      });
    };
    document.addEventListener(
      'transitionrun',
      (event) =>
        record(
          event.target,
          (event.target as Element)
            .getAnimations()
            .find(
              (animation) =>
                animation instanceof CSSTransition &&
                animation.transitionProperty === event.propertyName,
            ),
        ),
      true,
    );
    document.addEventListener(
      'animationstart',
      (event) =>
        record(
          event.target,
          (event.target as Element)
            .getAnimations()
            .find(
              (animation) =>
                animation instanceof CSSAnimation &&
                animation.animationName === event.animationName,
            ),
        ),
      true,
    );
  }, card);
}

async function recordElementsMadeInert(page: Page, card: string): Promise<void> {
  await page.evaluate((card) => {
    const elements: string[] = [];
    (window as unknown as { inertElements: string[] }).inertElements = elements;
    new MutationObserver((records) => {
      for (const { target } of records) {
        if (
          target instanceof Element &&
          target.hasAttribute('inert') &&
          target.isConnected &&
          target.closest(card)
        ) {
          elements.push(target.id || `inside ${target.parentElement?.closest('[id]')?.id}`);
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['inert'], subtree: true });
  }, card);
}

function elementsMadeInert(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { inertElements: string[] }).inertElements);
}

function whenFirstSyncSettled(page: Page): () => Promise<void> {
  const synced = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/donations/me/sync',
    { timeout: 10_000 },
  );
  return async () => {
    await synced;
    await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
  };
}

function recordedMoves(page: Page): Promise<Move[]> {
  return page.evaluate(() => (window as unknown as { recordedMoves: Move[] }).recordedMoves);
}

function reducedDuration(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--duration-reduced'),
      ) * 1000,
  );
}

async function expectOnlyInstantChangesOrShortFades(page: Page): Promise<void> {
  const moves = await recordedMoves(page);
  const reduced = await reducedDuration(page);
  for (const move of moves.filter((candidate) => candidate.duration > INSTANT_MS)) {
    expect(
      move.properties.filter((property) => MOVING.has(property) || SIZING.has(property)),
      move.on,
    ).toEqual([]);
    expect(move.duration, move.on).toBeLessThanOrEqual(reduced);
  }
}

function fadesOn(moves: readonly Move[], className: RegExp): boolean {
  return moves.some(
    (move) =>
      className.test(move.on) && move.duration > INSTANT_MS && move.properties.includes('opacity'),
  );
}

async function expectOnlyAShortFadeOn(page: Page, className: RegExp): Promise<void> {
  await expect.poll(async () => fadesOn(await recordedMoves(page), className)).toBe(true);
  await expectOnlyInstantChangesOrShortFades(page);
}

test.describe('Given a donor on a computer who asks for less motion', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

  test('when they sign out their only other device, then its row and the confirmation inside it are out of reach at once, the row only fades away without closing its height, and the heading takes the focus', async ({
    page,
  }) => {
    await mockDonorApi(page);
    let listed = signedInDevices;
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      (route) => route.fulfill({ json: { items: listed } }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/devices/'),
      async (route) => {
        listed = signedInDevices.filter((device) => device.current);
        await route.fulfill({ status: 204 });
      },
    );
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const devices = page.locator('.devices');
    await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
    await firstSyncSettled();
    await recordMoves(page, 'app-devices-card');
    await recordElementsMadeInert(page, 'app-devices-card');
    await devices
      .getByRole('group', { name: 'Odhlásit iPhone · Safari?' })
      .getByRole('button', { name: 'Odhlásit', exact: true })
      .click();

    await expect(devices.locator('.device-name')).toHaveText(['Mac · Safari']);
    await expect(devices.getByText('Jinde přihlášení nejste.')).toBeVisible();
    await expect(devices.getByRole('heading', { name: 'Přihlášená zařízení' })).toBeFocused();
    await expectOnlyAShortFadeOn(page, /(^| )device-slot( |$)/);
    const otherDevice = signedInDevices.find((device) => !device.current);
    const row = `device-row-${otherDevice?.id}`;
    expect(await elementsMadeInert(page)).toEqual([row, `inside ${row}`]);
  });

  test('when they open the older sign-ins, then the row says so at once, its chevron turns at once and the rows only fade in without opening their height', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donors/me/devices',
      (route) => route.fulfill({ json: { items: [...signedInDevices, ...longUnusedDevices] } }),
    );
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const older = page.locator('.devices').getByRole('button', { name: /Starší \(2\)/ });
    await firstSyncSettled();
    await recordMoves(page, 'app-devices-card');
    await older.click();

    await expect(older).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#devices-older .device-name')).toHaveText([
      'iPhone · aplikace',
      'Windows · Edge',
    ]);
    await expectOnlyAShortFadeOn(page, /(^| )devices-older( |$)/);
  });

  test('when they open Změnit heslo, then the toggle says so, the current password takes the focus at once and the panel only fades in', async ({
    page,
  }) => {
    await mockDonorApi(page);
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const toggle = page.locator('dd.account-actions').getByRole('button', { name: 'Změnit heslo' });
    await firstSyncSettled();
    await recordMoves(page, 'app-account-card');
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.locator('#account-password-panel').getByLabel('Současné heslo'),
    ).toBeFocused();
    await expectOnlyAShortFadeOn(page, /(^| )account-panel( |$)/);
  });

  test('when they open Jak přiřazujeme platby?, then the toggle says so at once and the help only fades in without opening its height', async ({
    page,
  }) => {
    await mockDonorApi(page);
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');

    const toggle = page.getByRole('button', { name: 'Jak přiřazujeme platby?' });
    await firstSyncSettled();
    await recordMoves(page, 'app-bank-accounts-card');
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Jak přiřazujeme platby' })).toBeVisible();
    await expectOnlyAShortFadeOn(page, /accounts-help-panel/);
  });
});

test.describe('Given a donor on a computer', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test('when they cancel the password form, then the toggle takes the focus at once and the closing panel is inert, so Tab never enters it', async ({
    page,
  }) => {
    await mockDonorApi(page);
    const firstSyncSettled = whenFirstSyncSettled(page);
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const toggle = page.locator('dd.account-actions').getByRole('button', { name: 'Změnit heslo' });
    const panel = page.locator('#account-password-panel');
    await firstSyncSettled();
    await toggle.click();
    await expect(panel.getByLabel('Současné heslo')).toBeFocused();

    await panel.getByRole('button', { name: 'Zrušit' }).click();

    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toHaveAttribute('inert', '');
    await page.keyboard.press('Tab');
    expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(false);
  });
});

const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 375, height: 667 };
const DOUBLE_ROOT = '200%';
const LARGEST_ROOT = '53px';
const SUBPIXEL_PX = 1;
const ROW_WATCHED_MS = 1000;
const ROW_AND_QUESTION = 'row height (left edge) and the question top under it (right edge)';

async function recordSlotMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rows: string[] = [];
    (window as unknown as { slotMotion: string[] }).slotMotion = rows;
    const record = (event: Event) => {
      if (event.target instanceof Element && event.target.matches('.device-sign-out-slot')) {
        rows.push(event.target.closest('li')?.id ?? '');
      }
    };
    document.addEventListener('transitionrun', record, true);
    document.addEventListener('animationstart', record, true);
  });
}

function slotMotion(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { slotMotion: string[] }).slotMotion);
}

function motionRunningOnSlots(page: Page): Promise<number[]> {
  return page
    .locator('.device-sign-out-slot')
    .evaluateAll((slots) => slots.map((slot) => slot.getAnimations().length));
}

async function recordTitleShift(page: Page, rowId: string): Promise<void> {
  await page.evaluate((rowId) => {
    const row = document.getElementById(rowId);
    const title = row?.querySelector('.device-name');
    const offset = () =>
      (title?.getBoundingClientRect().top ?? 0) - (row?.getBoundingClientRect().top ?? 0);
    const start = offset();
    const shift = { largest: 0, stopped: false };
    (window as unknown as { titleShift: typeof shift }).titleShift = shift;
    const measure = () => {
      if (shift.stopped || !row?.isConnected) {
        return;
      }
      shift.largest = Math.max(shift.largest, Math.abs(offset() - start));
      requestAnimationFrame(measure);
    };
    requestAnimationFrame(measure);
  }, rowId);
}

function stopTitleShift(page: Page): Promise<number> {
  return page.evaluate(() => {
    const shift = (window as unknown as { titleShift: { largest: number; stopped: boolean } })
      .titleShift;
    shift.stopped = true;
    return shift.largest;
  });
}

interface RowSample {
  readonly at: number;
  readonly height: number;
  readonly questionTop: number | null;
  readonly scrolled: number;
}

interface RowWatch {
  rowSamples: RowSample[];
  rowWatched: boolean;
}

async function rowAndQuestionWhile(
  page: Page,
  rowId: string,
  press: () => Promise<void>,
): Promise<{ start: [number, number]; frames: EdgeSample[]; scrolls: number[] }> {
  await page.evaluate(
    ({ rowId, watchedMs }) => {
      const watch = window as unknown as RowWatch;
      watch.rowSamples = [];
      watch.rowWatched = false;
      const slot = document.getElementById(rowId);
      const began = performance.now();
      const scrolledAbove = (element: Element | null): number => {
        let scrolled = 0;
        for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
          scrolled += parent.scrollTop;
        }
        return scrolled;
      };
      const sample = (frameTime: DOMHighResTimeStamp): void => {
        const row = slot?.querySelector('.device-row')?.getBoundingClientRect();
        const question = slot?.querySelector('.devices-confirm')?.getBoundingClientRect();
        watch.rowSamples.push({
          at: frameTime,
          height: row?.height ?? 0,
          questionTop: question === undefined || row === undefined ? null : question.top - row.top,
          scrolled: scrolledAbove(slot),
        });
        if (performance.now() - began < watchedMs) {
          requestAnimationFrame(sample);
        } else {
          watch.rowWatched = true;
        }
      };
      requestAnimationFrame(sample);
    },
    { rowId, watchedMs: ROW_WATCHED_MS },
  );
  await press();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as RowWatch).rowWatched))
    .toBe(true);
  const samples = await page.evaluate(() => (window as unknown as RowWatch).rowSamples);
  let questionTop = samples.find((sample) => sample.questionTop !== null)?.questionTop ?? 0;
  const frames = samples.map((sample): EdgeSample => {
    questionTop = sample.questionTop ?? questionTop;
    return { at: sample.at, edges: [sample.height, questionTop] };
  });
  return { start: frames[0].edges, frames, scrolls: samples.map((sample) => sample.scrolled) };
}

async function centreInTheSheet(element: Locator): Promise<void> {
  await element.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.closest('.dialog-panel')?.scrollBy({
      top: box.top + box.height / 2 - window.innerHeight / 2,
      behavior: 'instant',
    });
  });
}

async function sheetRoomAround(
  element: Locator,
): Promise<{ above: number; below: number; scrolled: number }> {
  return element.evaluate((element) => {
    const sheet = element.closest('.dialog-panel');
    let scrolled = 0;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      scrolled += parent.scrollTop;
    }
    return {
      above: sheet?.scrollTop ?? 0,
      below: sheet === null ? 0 : sheet.scrollHeight - sheet.clientHeight - sheet.scrollTop,
      scrolled,
    };
  });
}

function largestStep(values: number[]): number {
  return values.reduce(
    (largest, value, index) =>
      index === 0 ? largest : Math.max(largest, Math.abs(value - values[index - 1])),
    0,
  );
}

async function openDevicesOnAPhone(page: Page, rootSize?: string, viewport = PHONE): Promise<void> {
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/donors/me/devices',
    (route) => route.fulfill({ json: { items: [...signedInDevices, ...longUnusedDevices] } }),
  );
  await signIn(page);
  await page.setViewportSize(viewport);
  if (rootSize !== undefined) {
    await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
  }
  await recordSlotMotion(page);
  await openDonorSection(page, 'Údaje a zabezpečení');
}

function openDevicesOnAPhoneAtDoubleText(page: Page): Promise<void> {
  return openDevicesOnAPhone(page, DOUBLE_ROOT);
}

async function expectTheRowAndQuestionNeverToJump(page: Page): Promise<void> {
  const devices = page.locator('.devices');
  const rowId = `device-row-${signedInDevices.find((device) => !device.current)?.id}`;
  const question = devices.getByRole('group', { name: 'Odhlásit iPhone · Safari?' });

  const asking = await rowAndQuestionWhile(page, rowId, () =>
    devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click(),
  );
  await expect(question.getByRole('button', { name: 'Zrušit' })).toBeFocused();
  expect(jumpsOfTheEdges(asking.start, asking.frames), ROW_AND_QUESTION).toEqual([]);

  const scrolledBeforeCancel = await page.evaluate(() => window.scrollY);
  const cancelling = await rowAndQuestionWhile(page, rowId, () =>
    question.getByRole('button', { name: 'Zrušit' }).click(),
  );
  await expect(devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' })).toBeFocused();
  await expect(question).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolledBeforeCancel);
  expect(jumpsOfTheEdges(cancelling.start, cancelling.frames), ROW_AND_QUESTION).toEqual([]);
}

test.describe('Given a donor on a phone', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test('when they ask to sign out the iPhone and cancel, then in no frame does its row or the question under it jump', async ({
    page,
  }) => {
    await openDevicesOnAPhone(page);

    await expectTheRowAndQuestionNeverToJump(page);
  });
});

test.describe('Given a donor on a phone with the text at 200 %', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test('when Údaje a zabezpečení open and the older sign-ins unfold, then every Odhlásit is drawn in place, without unfolding or fading in', async ({
    page,
  }) => {
    await openDevicesOnAPhoneAtDoubleText(page);

    const devices = page.locator('.devices');
    await expect(devices.locator('.device-sign-out-slot')).toHaveCount(1);
    expect(await motionRunningOnSlots(page)).toEqual([0]);

    await devices.getByRole('button', { name: /Starší \(2\)/ }).click();

    await expect(devices.locator('#devices-older .device-name')).toHaveText([
      'iPhone · aplikace',
      'Windows · Edge',
    ]);
    expect(await motionRunningOnSlots(page)).toEqual([0, 0, 0]);
    expect(await slotMotion(page)).toEqual([]);
  });

  test('when they ask to sign out the iPhone and cancel, then its title stays in place, and only its Odhlásit unfolds back and keeps the focus', async ({
    page,
  }) => {
    await openDevicesOnAPhoneAtDoubleText(page);
    const devices = page.locator('.devices');
    await devices.getByRole('button', { name: /Starší \(2\)/ }).click();
    await expect(devices.locator('.device-sign-out-slot')).toHaveCount(3);
    const rowId = `device-row-${signedInDevices.find((device) => !device.current)?.id}`;
    const row = page.locator(`#${rowId}`);
    const signOut = devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' });

    await recordTitleShift(page, rowId);
    await signOut.click();

    const question = devices.getByRole('group', { name: 'Odhlásit iPhone · Safari?' });
    await expect(question.getByRole('button', { name: 'Zrušit' })).toBeFocused();
    await expect(row.locator('.device-sign-out-slot')).toHaveAttribute('inert', '');
    expect(await stopTitleShift(page)).toBeLessThanOrEqual(SUBPIXEL_PX);

    await recordSlotMotion(page);
    await question.getByRole('button', { name: 'Zrušit' }).click();

    await expect(signOut).toBeFocused();
    await expect.poll(() => slotMotion(page)).toContain(rowId);
    expect(new Set(await slotMotion(page))).toEqual(new Set([rowId]));
  });

  test('when they ask to sign out the iPhone and cancel, then in no frame does its row or the question under it jump', async ({
    page,
  }) => {
    await openDevicesOnAPhoneAtDoubleText(page);

    await expectTheRowAndQuestionNeverToJump(page);
  });
});

test.describe('Given a donor on a small phone with the largest text', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test('when they cancel signing out the iPhone while the question stands in the middle of the screen, then the page never scrolls and neither its row nor the question under it jumps', async ({
    page,
  }) => {
    await openDevicesOnAPhone(page, LARGEST_ROOT, SMALL_PHONE);
    const devices = page.locator('.devices');
    const rowId = `device-row-${signedInDevices.find((device) => !device.current)?.id}`;
    const question = devices.getByRole('group', { name: 'Odhlásit iPhone · Safari?' });
    const cancel = question.getByRole('button', { name: 'Zrušit' });

    await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
    await expect(cancel).toBeFocused();
    await expect
      .poll(() =>
        question.evaluate(
          (element) =>
            element
              .closest('li')
              ?.getAnimations({ subtree: true })
              .filter((animation) => animation.playState === 'running').length,
        ),
      )
      .toBe(0);
    await centreInTheSheet(question);
    await expect
      .poll(() =>
        question.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return Math.abs(box.top + box.height / 2 - window.innerHeight / 2);
        }),
      )
      .toBeLessThanOrEqual(SUBPIXEL_PX);
    const room = await sheetRoomAround(question);
    expect(room.above).toBeGreaterThan(SUBPIXEL_PX);
    expect(room.below).toBeGreaterThan(SUBPIXEL_PX);

    const scrolledBeforeCancel = room.scrolled;
    const cancelling = await rowAndQuestionWhile(page, rowId, () => page.keyboard.press('Enter'));

    await expect(devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' })).toBeFocused();
    await expect(question).toHaveCount(0);
    expect(largestStep([scrolledBeforeCancel, ...cancelling.scrolls])).toBeLessThanOrEqual(
      SUBPIXEL_PX,
    );
    expect(jumpsOfTheEdges(cancelling.start, cancelling.frames), ROW_AND_QUESTION).toEqual([]);
  });
});
