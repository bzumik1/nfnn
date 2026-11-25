import { Locator, Page } from '@playwright/test';
import {
  administrator,
  claudeConnection,
  donor,
  longUnusedDevices,
  mockDonorApi,
  openDonorSection,
  signedInDevices,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';
import { offerPasskeysAsAnIPhoneDoes } from './passkeys-offered';

interface Box {
  readonly top: number;
  readonly height: number;
  readonly opacity: number;
}

interface Line {
  readonly top: number;
  readonly bottom: number;
  readonly alpha: number;
}

interface Frame {
  readonly at: number;
  readonly boxes: Readonly<Record<string, Box | null>>;
  readonly lines: readonly Line[];
  readonly afters: readonly string[];
}

interface FrameWatch {
  settingsFrames: Frame[];
  settingsWatched: boolean;
  settingsActed: boolean;
}

const COMPUTER = { width: 1280, height: 800 };
const SMALL_PHONE = { width: 375, height: 667 };
const LARGEST_SYSTEM_TEXT_PX = 53;
const ROOM_FOR_THREE_CONNECTIONS = 1600;
const ROOM_FOR_THE_OLDER_QUESTION = 1600;
const ROOM_FOR_THE_CONNECTIONS = 1600;
const WATCHED_MS = 1000;
const SUBPIXEL_PX = 0.5;
const GONE_OPACITY = 0.01;
const SHOWING_OPACITY = 0.05;
const STANDING_OPACITY = 0.5;
const ONE_LINE_PX = 2;
const DIVIDER_PX = 1;

const otherDevice = signedInDevices.find((device) => !device.current);
const otherRow = `#device-row-${otherDevice?.id}`;

const iphonePasskey = {
  id: '019a1b2c-3d4e-7f00-8000-000000000001',
  name: 'iPhone',
  createdAt: '2026-10-23T10:00:00Z',
  lastUsedAt: null,
};
const notebookPasskey = {
  id: '019a1b2c-3d4e-7f00-8000-000000000002',
  name: 'Pracovní notebook',
  createdAt: '2026-10-24T10:00:00Z',
  lastUsedAt: '2026-10-25T08:00:00Z',
};
const iphonePasskeyRow = `#passkey-row-${iphonePasskey.id}`;
const olderInstalledAppRow = `#device-row-${longUnusedDevices[0].id}`;
const nextOlderRow = `#device-row-${longUnusedDevices[1].id}`;

const otherConnection = {
  ...claudeConnection,
  id: '0192f0f1-0000-7000-8000-000000000012',
  client: 'chatgpt.com',
};
const thirdConnection = {
  ...claudeConnection,
  id: '0192f0f1-0000-7000-8000-000000000013',
  client: 'cursor.com',
};
const claudeConnectionRow = `#connection-row-${claudeConnection.id}`;
const otherConnectionRow = `#connection-row-${otherConnection.id}`;
const thirdConnectionRow = `#connection-row-${thirdConnection.id}`;

interface DoubleTapWatch {
  leaveHeld: boolean;
  pressedOnRemoval: string | null | undefined;
}

async function framesWhile(
  page: Page,
  watched: Record<string, string>,
  act: () => Promise<void>,
  recording: { readonly removed?: string; readonly dividers?: string } = {},
): Promise<Frame[]> {
  await page.evaluate(
    ({ watched, watchedMs, removed, dividers }) => {
      const watch = window as unknown as FrameWatch;
      watch.settingsFrames = [];
      watch.settingsWatched = false;
      watch.settingsActed = false;
      const began = performance.now();
      const drawnLine = (element: Element, from: number, width: number): Line[] => {
        let top = from;
        let bottom = from + width;
        let alpha = 1;
        for (let node: Element | null = element; node !== null; node = node.parentElement) {
          const style = getComputedStyle(node);
          alpha *= Number(style.opacity);
          if (node !== element && style.overflowY !== 'visible') {
            const clip = node.getBoundingClientRect();
            top = Math.max(top, clip.top);
            bottom = Math.min(bottom, clip.bottom);
          }
        }
        return bottom > top ? [{ top, bottom, alpha }] : [];
      };
      const dividerElements = (): Element[] =>
        dividers === null ? [] : [...document.querySelectorAll(dividers)];
      const drawnLines = (): Line[] =>
        dividerElements().flatMap((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          const above = parseFloat(style.borderTopWidth);
          const below = parseFloat(style.borderBottomWidth);
          const after = getComputedStyle(element, '::after');
          const belowAfter =
            after.borderBottomStyle === 'none' ? 0 : parseFloat(after.borderBottomWidth) || 0;
          return [
            ...(above > 0 ? drawnLine(element, box.top, above) : []),
            ...(below > 0 ? drawnLine(element, box.bottom - below, below) : []),
            ...(belowAfter > 0 ? drawnLine(element, box.bottom - belowAfter, belowAfter) : []),
          ];
        });
      const drawnAfters = (): string[] =>
        dividerElements().flatMap((element) => {
          const after = getComputedStyle(element, '::after');
          return after.content === 'none' && after.borderBottomStyle === 'none'
            ? []
            : [
                `${element.id || element.className} ::after content ${after.content} border-bottom ${after.borderBottomStyle} ${after.borderBottomWidth}`,
              ];
        });
      let sampledAfterAct = false;
      const cardSettled = (): boolean =>
        (document.querySelector(watched['card'])?.getAnimations({ subtree: true }) ?? []).every(
          (animation) => animation.playState === 'finished',
        );
      const sample = (frameTime: DOMHighResTimeStamp): void => {
        const boxes: Record<string, Box | null> = {};
        for (const [name, selector] of Object.entries(watched)) {
          const element = document.querySelector(selector);
          boxes[name] =
            element === null
              ? null
              : {
                  top: element.getBoundingClientRect().top,
                  height: element.getBoundingClientRect().height,
                  opacity: Number(getComputedStyle(element).opacity),
                };
        }
        watch.settingsFrames.push({
          at: frameTime - began,
          boxes,
          lines: drawnLines(),
          afters: drawnAfters(),
        });
        sampledAfterAct ||= watch.settingsActed;
        const stillThere = removed !== null && document.querySelector(removed) !== null;
        if (
          performance.now() - began < watchedMs ||
          !sampledAfterAct ||
          stillThere ||
          !cardSettled()
        ) {
          requestAnimationFrame(sample);
        } else {
          watch.settingsWatched = true;
        }
      };
      requestAnimationFrame(sample);
    },
    {
      watched,
      watchedMs: WATCHED_MS,
      removed: recording.removed ?? null,
      dividers: recording.dividers ?? null,
    },
  );
  await act();
  await page.evaluate(() => {
    (window as unknown as FrameWatch).settingsActed = true;
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as FrameWatch).settingsWatched))
    .toBe(true);
  return page.evaluate(() => (window as unknown as FrameWatch).settingsFrames);
}

function present(frames: readonly Frame[], name: string): { at: number; box: Box }[] {
  return frames.flatMap((frame) => {
    const box = frame.boxes[name];
    return box === null ? [] : [{ at: frame.at, box }];
  });
}

function growths(frames: readonly Frame[], name: string, measure: keyof Box): string[] {
  const shown = present(frames, name);
  return shown.flatMap(({ at, box }, index) => {
    const before = index === 0 ? null : shown[index - 1].box[measure];
    const tolerance = measure === 'height' ? SUBPIXEL_PX : GONE_OPACITY;
    return before !== null && box[measure] > before + tolerance
      ? [`${name} ${measure} ${before} → ${box[measure]} at +${Math.round(at)} ms`]
      : [];
  });
}

async function recordRowsShownAgain(page: Page, rows: string, leaving: string): Promise<void> {
  await page.evaluate(
    ({ rows, leaving }) => {
      const shownAgain: Box[] = [];
      (window as unknown as { rowsShownAgain: Box[] }).rowsShownAgain = shownAgain;
      new MutationObserver((records) => {
        for (const { target, oldValue } of records) {
          if (
            target instanceof Element &&
            target.matches(rows) &&
            target.isConnected &&
            (oldValue ?? '').split(' ').includes(leaving) &&
            !target.classList.contains(leaving)
          ) {
            shownAgain.push({
              top: target.getBoundingClientRect().top,
              height: target.getBoundingClientRect().height,
              opacity: Number(getComputedStyle(target).opacity),
            });
          }
        }
      }).observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
        subtree: true,
      });
    },
    { rows, leaving },
  );
}

function rowsShownAgain(page: Page): Promise<Box[]> {
  return page.evaluate(() => (window as unknown as { rowsShownAgain: Box[] }).rowsShownAgain);
}

interface LeavingRow {
  readonly id: string;
  readonly inert: boolean;
}

async function recordLeavingRows(page: Page, rows: string, leaving: string): Promise<void> {
  await page.evaluate(
    ({ rows, leaving }) => {
      const seen: LeavingRow[] = [];
      (window as unknown as { leavingRows: LeavingRow[] }).leavingRows = seen;
      new MutationObserver((records) => {
        for (const { target, oldValue } of records) {
          if (
            target instanceof Element &&
            target.matches(rows) &&
            !(oldValue ?? '').split(' ').includes(leaving) &&
            target.classList.contains(leaving)
          ) {
            seen.push({ id: target.id, inert: target.hasAttribute('inert') });
          }
        }
      }).observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
        subtree: true,
      });
    },
    { rows, leaving },
  );
}

function leavingRows(page: Page): Promise<LeavingRow[]> {
  return page.evaluate(() => (window as unknown as { leavingRows: LeavingRow[] }).leavingRows);
}

interface EndWatch {
  closeEnd: number | null;
}

async function heightAtTheEndOfTheClose(
  page: Page,
  card: string,
  closing: string,
  act: () => Promise<void>,
): Promise<number> {
  await page.evaluate(
    ({ card, closing }) => {
      const watch = window as unknown as EndWatch;
      watch.closeEnd = null;
      const atTheEnd = (event: TransitionEvent): void => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          !target.matches(closing) ||
          event.propertyName !== 'grid-template-rows'
        ) {
          return;
        }
        document.removeEventListener('transitionrun', atTheEnd, true);
        const motions = target.getAnimations();
        for (const motion of motions) {
          motion.pause();
          motion.currentTime = Number(motion.effect?.getComputedTiming().endTime ?? 0) - 1;
        }
        watch.closeEnd = document.querySelector(card)?.getBoundingClientRect().height ?? 0;
        for (const motion of motions) {
          motion.play();
        }
      };
      document.addEventListener('transitionrun', atTheEnd, true);
    },
    { card, closing },
  );
  await act();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as EndWatch).closeEnd))
    .not.toBeNull();
  return (await page.evaluate(() => (window as unknown as EndWatch).closeEnd)) ?? 0;
}

function heightOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((element) => element.getBoundingClientRect().height);
}

async function settled(page: Page, selector: string): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator(selector)
        .evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter((motion) => motion.playState !== 'finished').length,
        ),
    )
    .toBe(0);
}

function risesAboveTheEnd(frames: readonly Frame[], name: string): string[] {
  const shown = present(frames, name);
  const end = shown[shown.length - 1].box.height;
  const reached = shown.findIndex(({ box }) => box.height <= end + SUBPIXEL_PX);
  return shown
    .slice(reached)
    .filter(({ box }) => box.height > end + SUBPIXEL_PX)
    .map(({ at, box }) => `${name} ${box.height} above its end ${end} at +${Math.round(at)} ms`);
}

function doubledLines(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, lines }) => {
    const standing = lines
      .filter((line) => line.alpha > STANDING_OPACITY)
      .map((line) => line.top)
      .sort((above, below) => above - below);
    return standing.flatMap((top, index) =>
      index > 0 && top - standing[index - 1] < ONE_LINE_PX
        ? [`two dividers at ${standing[index - 1]} and ${top} at +${Math.round(at)} ms`]
        : [],
    );
  });
}

function linesOutlastingTheRow(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, boxes, lines }) => {
    const next = boxes['next'];
    if (next === null) {
      return [];
    }
    const fading = boxes['row']?.opacity ?? 0;
    return lines
      .filter((line) => line.top < next.top && line.alpha > fading + GONE_OPACITY)
      .map(
        (line) =>
          `divider above the next row at alpha ${line.alpha} while the row is at ${fading} at +${Math.round(at)} ms`,
      );
  });
}

function notOneDividerAboveTheNextRow(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, boxes, lines }) => {
    const next = boxes['next'];
    if (next === null) {
      return [`no next row at +${Math.round(at)} ms`];
    }
    const standing = lines.filter(
      (line) => line.alpha > STANDING_OPACITY && Math.abs(line.top - next.top) < ONE_LINE_PX,
    );
    return standing.length === 1
      ? []
      : [`${standing.length} dividers above the next row at +${Math.round(at)} ms`];
  });
}

function jumpOnRemoval(frames: readonly Frame[]): string[] {
  const removed = frames.findIndex(
    ({ boxes }, index) =>
      index > 0 && boxes['row'] === null && frames[index - 1].boxes['row'] !== null,
  );
  if (removed < 0) {
    return ['the row was never removed while watched'];
  }
  const before = frames[removed - 1].boxes;
  const after = frames[removed].boxes;
  if (before['next'] === null || after['next'] === null || before['row'] === null) {
    return ['no next row around the removal'];
  }
  const expected = before['next'].top - before['row'].height;
  return Math.abs(after['next'].top - expected) <= SUBPIXEL_PX
    ? []
    : [
        `next row ${before['next'].top} → ${after['next'].top} on removal, the row still ${before['row'].height} high, at +${Math.round(frames[removed].at)} ms`,
      ];
}

function notOneDividerOnTheRowsBottom(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, boxes, lines, afters }) => {
    const row = boxes['row'];
    const nextRow = boxes['nextRow'];
    if (row === null || nextRow === null) {
      return [];
    }
    const when = `at +${Math.round(at)} ms (${afters.join('; ') || 'no ::after style'})`;
    const rowBottom = row.top + row.height;
    const onTheNextRow = lines.filter((line) => Math.abs(line.bottom - nextRow.top) <= SUBPIXEL_PX);
    const standing = onTheNextRow.filter((line) => line.alpha > STANDING_OPACITY);
    return [
      ...(Math.abs(rowBottom - nextRow.top) <= SUBPIXEL_PX
        ? []
        : [`row bottom ${rowBottom} apart from the next row's top ${nextRow.top} ${when}`]),
      ...(onTheNextRow.length === 1
        ? []
        : [`${onTheNextRow.length} dividers on the next row's top ${nextRow.top} ${when}`]),
      ...(row.opacity > STANDING_OPACITY && standing.length !== 1
        ? [`no standing divider on the next row's top while the row is at ${row.opacity} ${when}`]
        : []),
    ];
  });
}

function topsWithin(
  frames: readonly Frame[],
  name: string,
  within: string,
): { at: number; top: number }[] {
  return frames.flatMap(({ at, boxes }) => {
    const box = boxes[name];
    const container = boxes[within];
    return box === null || container === null ? [] : [{ at, top: box.top - container.top }];
  });
}

function movesWithinFromTheFirstFrame(
  frames: readonly Frame[],
  name: string,
  within: string,
): string[] {
  const shown = topsWithin(frames, name, within);
  const first = shown[0]?.top;
  return shown.flatMap(({ at, top }) =>
    Math.abs(top - first) <= SUBPIXEL_PX
      ? []
      : [`${name} top in ${within} ${first} → ${top} at +${Math.round(at)} ms`],
  );
}

function movesDownWithin(frames: readonly Frame[], name: string, within: string): string[] {
  const shown = topsWithin(frames, name, within);
  return shown.flatMap(({ at, top }, index) =>
    index > 0 && top > shown[index - 1].top + SUBPIXEL_PX
      ? [`${name} top in ${within} ${shown[index - 1].top} → ${top} at +${Math.round(at)} ms`]
      : [],
  );
}

function dividersLeftAfterRemoval(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, boxes, lines }) =>
    boxes['row'] === null
      ? lines.map((line) => `divider at ${line.top} after removal at +${Math.round(at)} ms`)
      : [],
  );
}

function dividersThickerThanOnePx(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, lines, afters }) =>
    lines
      .filter((line) => line.bottom - line.top > DIVIDER_PX + SUBPIXEL_PX)
      .map(
        (line) =>
          `divider ${line.bottom - line.top} px thick at ${line.top} at +${Math.round(at)} ms (${afters.join('; ') || 'no ::after style'})`,
      ),
  );
}

function notOneDividerAboveTheLastRow(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, boxes, lines, afters }) => {
    const lastRow = boxes['lastRow'];
    if (lastRow === null) {
      return [`no last row at +${Math.round(at)} ms`];
    }
    const touching = lines.filter(
      (line) =>
        line.alpha > GONE_OPACITY &&
        line.top <= lastRow.top + SUBPIXEL_PX &&
        line.bottom >= lastRow.top - SUBPIXEL_PX,
    );
    return touching.length === 1
      ? []
      : [
          `${touching.length} dividers on the last row's top ${lastRow.top} at +${Math.round(at)} ms (${afters.join('; ') || 'no ::after style'})`,
        ];
  });
}

function standingDividerLeavesItsPlace(frames: readonly Frame[]): string[] {
  const placed = frames.flatMap(({ at, boxes, lines }) => {
    const row = boxes['row'];
    const card = boxes['card'];
    return row === null || card === null || row.opacity <= STANDING_OPACITY
      ? []
      : [
          {
            at,
            tops: lines
              .filter((line) => line.alpha > STANDING_OPACITY)
              .map((line) => line.top - card.top),
          },
        ];
  });
  const first = placed[0]?.tops[0];
  return placed.flatMap(({ at, tops }) =>
    tops.length === 1 && Math.abs(tops[0] - first) <= SUBPIXEL_PX
      ? []
      : [
          `standing dividers at ${tops.join(', ')} in the card, the first at ${first}, at +${Math.round(at)} ms`,
        ],
  );
}

function dividersOffTheTopOf(frames: readonly Frame[], name: string): string[] {
  return frames.flatMap(({ at, boxes, lines }) => {
    const row = boxes[name];
    return row === null
      ? []
      : lines
          .filter(
            (line) =>
              line.alpha > GONE_OPACITY &&
              (line.bottom < row.top - SUBPIXEL_PX || line.top > row.top + SUBPIXEL_PX),
          )
          .map(
            (line) =>
              `divider ${line.top}–${line.bottom} off ${name}'s top ${row.top} at +${Math.round(at)} ms`,
          );
  });
}

function dividersBrighterThanTheRow(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, boxes, lines }) => {
    const row = boxes['row'];
    return row === null
      ? []
      : lines
          .filter((line) => line.alpha > row.opacity + GONE_OPACITY)
          .map(
            (line) =>
              `divider at alpha ${line.alpha} while the row is at ${row.opacity} at +${Math.round(at)} ms`,
          );
  });
}

function framesWithBothRowsAndOneDivider(frames: readonly Frame[]): number {
  return frames.filter(({ boxes, lines }) => {
    const row = boxes['row'];
    const nextRow = boxes['nextRow'];
    return (
      row !== null &&
      nextRow !== null &&
      row.opacity > STANDING_OPACITY &&
      nextRow.opacity > STANDING_OPACITY &&
      lines.filter((line) => line.alpha > STANDING_OPACITY).length === 1
    );
  }).length;
}

async function giveTheConnectionsRoom(page: Page): Promise<void> {
  const { width } = page.viewportSize()!;
  await page.setViewportSize({ width, height: ROOM_FOR_THE_CONNECTIONS });
}

function moreThanOneStandingDivider(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, lines }) => {
    const standing = lines.filter((line) => line.alpha > STANDING_OPACITY);
    return standing.length <= 1
      ? []
      : [`${standing.length} standing dividers at +${Math.round(at)} ms`];
  });
}

function risesAboveItsEndWithin(frames: readonly Frame[], name: string, within: string): string[] {
  const shown = topsWithin(frames, name, within);
  const end = shown[shown.length - 1]?.top;
  return shown.flatMap(({ at, top }) =>
    top < end - SUBPIXEL_PX
      ? [`${name} top in ${within} ${top} above its end ${end} at +${Math.round(at)} ms`]
      : [],
  );
}

function movesAfterTheEmptyTextShows(frames: readonly Frame[], name: string): string[] {
  const shown = frames.flatMap(({ at, boxes }) => {
    const card = boxes[name];
    const empty = boxes['empty'];
    return card !== null && empty !== null && empty.opacity > SHOWING_OPACITY
      ? [{ at, height: card.height }]
      : [];
  });
  return shown.flatMap(({ at, height }, index) =>
    index > 0 && Math.abs(height - shown[index - 1].height) > SUBPIXEL_PX
      ? [`${name} ${shown[index - 1].height} → ${height} at +${Math.round(at)} ms`]
      : [],
  );
}

type DeviceList = typeof signedInDevices;

async function openSettings(
  page: Page,
  devices: DeviceList = signedInDevices,
  user: typeof donor = donor,
  routes: () => Promise<void> = async () => undefined,
): Promise<(devices: DeviceList) => void> {
  await mockDonorApi(page);
  await routes();
  let listed = devices;
  await page.route(
    (url) => url.pathname === '/api/donors/me/devices',
    (route) => route.fulfill({ json: { items: listed } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/donors/me/devices/'),
    async (route) => {
      const id = new URL(route.request().url()).pathname.split('/').pop();
      listed = listed.filter((device) => device.id !== id);
      await route.fulfill({ status: 204 });
    },
  );
  const synced = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/donations/me/sync',
  );
  await signIn(page, user);
  await openDonorSection(page, 'Údaje a zabezpečení');
  await synced;
  await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
  await untilThePageFadeHasEnded(page);
  return (devices) => (listed = devices);
}

async function untilThePageFadeHasEnded(page: Page): Promise<void> {
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)page-fade-(hidden|arriving)(\s|$)/);
}

function expectOnlyClosedUntilRemoved(frames: readonly Frame[], shownAgain: readonly Box[]): void {
  expect(present(frames, 'row').length).toBeGreaterThan(0);
  expect(frames.at(-1)?.boxes['row']).toBeNull();
  expect(
    shownAgain.filter((box) => box.opacity > GONE_OPACITY || box.height > SUBPIXEL_PX),
  ).toEqual([]);
  expect(growths(frames, 'row', 'opacity')).toEqual([]);
}

async function confirmSigningOutTheIPhone(page: Page): Promise<Frame[]> {
  const devices = page.locator('.devices');
  await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
  const question = devices.getByRole('group', { name: 'Odhlásit iPhone · Safari?' });
  await expect(question.getByRole('button', { name: 'Zrušit' })).toBeFocused();
  await settled(page, '.devices');
  await recordRowsShownAgain(page, '.device-slot', 'device-slot--leaving');

  const frames = await framesWhile(
    page,
    { row: otherRow, card: '.devices' },
    () => question.getByRole('button', { name: 'Odhlásit', exact: true }).click(),
    { removed: otherRow },
  );

  await expect(devices.locator('.device-name')).toHaveText(['Mac · Safari']);
  await expect(devices.getByRole('heading', { name: 'Přihlášená zařízení' })).toBeFocused();
  expectOnlyClosedUntilRemoved(frames, await rowsShownAgain(page));
  return frames;
}

async function showLargestSystemText(page: Page): Promise<void> {
  await page.addInitScript((px) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${px}px; }`;
      document.head.append(style);
    });
  }, LARGEST_SYSTEM_TEXT_PX);
}

async function openSettingsWithPasskeys(
  page: Page,
  passkeys: readonly (typeof iphonePasskey | typeof notebookPasskey)[],
): Promise<() => void> {
  let listed = [...passkeys];
  const removeTheIPhone = (): void => {
    listed = listed.filter((passkey) => passkey.id !== iphonePasskey.id);
  };
  await openSettings(page, signedInDevices, donor, async () => {
    await page.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      (route) => route.fulfill({ json: { items: listed } }),
    );
    await page.route(
      (url) => url.pathname === `/api/donors/me/passkeys/${iphonePasskey.id}`,
      async (route) => {
        removeTheIPhone();
        await route.fulfill({ status: 204 });
      },
    );
  });
  await page.getByRole('button', { name: 'Spravovat přístupové klíče' }).click();
  await expect(page.locator('.passkey-name')).toHaveText(passkeys.map((passkey) => passkey.name));
  return removeTheIPhone;
}

function openSettingsWithTwoPasskeys(page: Page): Promise<() => void> {
  return openSettingsWithPasskeys(page, [iphonePasskey, notebookPasskey]);
}

async function confirmRemovingTheIPhonePasskey(page: Page): Promise<Frame[]> {
  const row = page.locator(iphonePasskeyRow);
  await row.getByRole('button', { name: 'Odebrat' }).click();
  const confirm = row.getByRole('button', { name: 'Ano, odebrat' });
  await expect(confirm).toBeVisible();
  await settled(page, 'app-account-card .ui-card');
  await recordRowsShownAgain(page, '.passkey-slot', 'passkey-slot--leaving');

  const frames = await framesWhile(
    page,
    { row: iphonePasskeyRow, card: 'app-account-card .ui-card' },
    () => confirm.click(),
    { removed: iphonePasskeyRow },
  );

  await expect(page.locator('.passkey-name')).toHaveText(['Pracovní notebook']);
  await expect(page.locator(`#passkey-rename-button-${notebookPasskey.id}`)).toBeFocused();
  expectOnlyClosedUntilRemoved(frames, await rowsShownAgain(page));
  return frames;
}

async function openSettingsWithConnections(
  page: Page,
  connections: readonly (typeof claudeConnection)[],
): Promise<(ids?: readonly string[]) => void> {
  let listed = [...connections];
  const disconnectElsewhere = (ids: readonly string[] = [claudeConnection.id]): void => {
    listed = listed.filter((connection) => !ids.includes(connection.id));
  };
  await openSettings(page, signedInDevices, administrator, async () => {
    await page.route(
      (url) => url.pathname === '/api/donors/me/connections',
      (route) => route.fulfill({ json: { items: listed } }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/connections/'),
      async (route) => {
        disconnectElsewhere([new URL(route.request().url()).pathname.split('/').pop() ?? '']);
        await route.fulfill({ status: 204 });
      },
    );
  });
  await expect(page.locator('.connection-client')).toHaveText(
    connections.map((connection) => connection.client),
  );
  return disconnectElsewhere;
}

function openSettingsWithTwoConnections(page: Page): Promise<(ids?: readonly string[]) => void> {
  return openSettingsWithConnections(page, [claudeConnection, otherConnection]);
}

async function openSettingsCountingDisconnects(page: Page): Promise<string[]> {
  const disconnected: string[] = [];
  let listed = [claudeConnection, otherConnection];
  await openSettings(page, signedInDevices, administrator, async () => {
    await page.route(
      (url) => url.pathname === '/api/donors/me/connections',
      (route) => route.fulfill({ json: { items: listed } }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/connections/'),
      async (route) => {
        const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
        disconnected.push(id);
        listed = listed.filter((connection) => connection.id !== id);
        await route.fulfill({ status: 204 });
      },
    );
  });
  await expect(page.locator('.connection-client')).toHaveText(['claude.ai', 'chatgpt.com']);
  await settled(page, '.connections');
  return disconnected;
}

async function holdTheLeaveOf(page: Page, row: string): Promise<void> {
  await page.evaluate(
    ({ row, leaving }) => {
      const watch = window as unknown as DoubleTapWatch;
      watch.leaveHeld = false;
      const observer = new MutationObserver(() => {
        const element = document.querySelector(row);
        if (element === null || !element.classList.contains(leaving)) {
          return;
        }
        observer.disconnect();
        for (const motion of element.getAnimations()) {
          motion.pause();
        }
        watch.leaveHeld = true;
      });
      observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    },
    { row, leaving: 'connection-slot--leaving' },
  );
}

async function pressWhereItWasOnRemoval(page: Page, row: string, button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (box === null) {
    throw new Error(`${row} has no Odpojit on the screen`);
  }
  await page.evaluate(
    ({ row, x, y }) => {
      const watch = window as unknown as DoubleTapWatch;
      watch.pressedOnRemoval = undefined;
      const observer = new MutationObserver(() => {
        if (document.querySelector(row) !== null) {
          return;
        }
        observer.disconnect();
        const reached = document.elementFromPoint(x, y)?.closest('button');
        watch.pressedOnRemoval =
          reached === null || reached === undefined
            ? null
            : `${reached.textContent?.trim()} of ${reached.closest('li')?.id}`;
      });
      observer.observe(document.body, { subtree: true, childList: true });
    },
    { row, x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
}

function pressedOnRemoval(page: Page): Promise<string | null | undefined> {
  return page.evaluate(() => (window as unknown as DoubleTapWatch).pressedOnRemoval);
}

async function expectTheDoubleTapToReachNothingOnRemoval(page: Page): Promise<string[]> {
  const disconnected = await openSettingsCountingDisconnects(page);
  const disconnect = page.locator(claudeConnectionRow).getByRole('button', { name: 'Odpojit' });
  await pressWhereItWasOnRemoval(page, claudeConnectionRow, disconnect);

  await disconnect.click();

  await expect.poll(() => pressedOnRemoval(page)).not.toBeUndefined();
  expect(await pressedOnRemoval(page)).toBeNull();
  await expect(page.locator('.connection-client')).toHaveText(['chatgpt.com']);
  return disconnected;
}

async function disconnectClaudeWatchingDividers(page: Page): Promise<Frame[]> {
  const { width } = page.viewportSize()!;
  await page.setViewportSize({ width, height: ROOM_FOR_THREE_CONNECTIONS });
  await openSettingsWithTwoConnections(page);
  const disconnect = page.locator(claudeConnectionRow).getByRole('button', { name: 'Odpojit' });
  const nextClient = page.locator(`${otherConnectionRow} .connection-client`);
  await nextClient.scrollIntoViewIfNeeded();
  await settled(page, '.connections');
  await expect(disconnect).toBeInViewport({ ratio: 1 });
  await expect(nextClient).toBeInViewport({ ratio: 1 });

  const frames = await framesWhile(
    page,
    {
      row: claudeConnectionRow,
      card: '.connections',
      client: `${claudeConnectionRow} .connection-client`,
      next: `${otherConnectionRow} .connection-body`,
      nextRow: otherConnectionRow,
      nextClient: `${otherConnectionRow} .connection-client`,
    },
    () => disconnect.click(),
    { removed: claudeConnectionRow, dividers: '.connection, .connection-slot' },
  );

  await expect(page.locator('.connection-client')).toHaveText(['chatgpt.com']);
  expect(present(frames, 'row').length).toBeGreaterThan(0);
  expect(frames.at(-1)?.boxes['row']).toBeNull();
  expect(linesOutlastingTheRow(frames)).toEqual([]);
  expect(dividersLeftAfterRemoval(frames)).toEqual([]);
  return frames;
}

async function disconnectChatGptWatchingDividers(page: Page): Promise<Frame[]> {
  await giveTheConnectionsRoom(page);
  await openSettingsWithTwoConnections(page);
  const disconnect = page.locator(otherConnectionRow).getByRole('button', { name: 'Odpojit' });
  await disconnect.scrollIntoViewIfNeeded();
  await settled(page, '.connections');
  await expect(page.locator(claudeConnectionRow)).toBeInViewport({ ratio: 1 });
  await expect(page.locator(otherConnectionRow)).toBeInViewport({ ratio: 1 });

  const frames = await framesWhile(
    page,
    {
      row: otherConnectionRow,
      card: '.connections',
      client: `${claudeConnectionRow} .connection-client`,
      leavingClient: `${otherConnectionRow} .connection-client`,
    },
    () => disconnect.click(),
    { removed: otherConnectionRow, dividers: '.connection, .connection-slot' },
  );

  await expect(page.locator('.connection-client')).toHaveText(['claude.ai']);
  expect(present(frames, 'row').length).toBeGreaterThan(0);
  expect(frames.at(-1)?.boxes['row']).toBeNull();
  expect(standingDividerLeavesItsPlace(frames)).toEqual([]);
  expect(dividersOffTheTopOf(frames, 'row')).toEqual([]);
  expect(dividersBrighterThanTheRow(frames)).toEqual([]);
  expect(dividersLeftAfterRemoval(frames)).toEqual([]);
  expect(movesWithinFromTheFirstFrame(frames, 'client', 'card')).toEqual([]);
  expect(movesWithinFromTheFirstFrame(frames, 'leavingClient', 'card')).toEqual([]);
  return frames;
}

async function bothConnectionsLeaveOnReturnWatchingDividers(page: Page): Promise<Frame[]> {
  await giveTheConnectionsRoom(page);
  const disconnectElsewhere = await openSettingsWithTwoConnections(page);
  await openDonorSection(page, 'Můj přehled');
  disconnectElsewhere([claudeConnection.id, otherConnection.id]);
  let answer = (): void => undefined;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route(
    (url) => url.pathname === '/api/donors/me/connections',
    async (route) => {
      await answered;
      await route.fallback();
    },
  );
  const asked = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/donors/me/connections',
  );
  await openDonorSection(page, 'Údaje a zabezpečení');
  await asked;
  await expect(page.locator('.connection-client')).toHaveText(['claude.ai', 'chatgpt.com']);
  await settled(page, '.connections');
  await expect(async () => {
    await page.locator(otherConnectionRow).scrollIntoViewIfNeeded();
    await expect(page.locator(claudeConnectionRow)).toBeInViewport({ ratio: 1, timeout: 1000 });
    await expect(page.locator(otherConnectionRow)).toBeInViewport({ ratio: 1, timeout: 1000 });
  }).toPass();
  await recordLeavingRows(page, '.connection-slot', 'connection-slot--leaving');

  const frames = await framesWhile(
    page,
    {
      row: claudeConnectionRow,
      nextRow: otherConnectionRow,
      card: '.connections',
      client: `${claudeConnectionRow} .connection-client`,
      nextClient: `${otherConnectionRow} .connection-client`,
    },
    async () => answer(),
    { removed: '.connection-list', dividers: '.connection, .connection-slot' },
  );

  await expect(page.locator('.connection-client')).toHaveCount(0);
  expect([...new Set((await leavingRows(page)).map(({ id }) => id))].sort()).toEqual(
    [claudeConnectionRow.slice(1), otherConnectionRow.slice(1)].sort(),
  );
  expect(framesWithBothRowsAndOneDivider(frames)).toBeGreaterThan(0);
  expect(frames.at(-1)?.boxes['row']).toBeNull();
  expect(frames.at(-1)?.boxes['nextRow']).toBeNull();
  expect(moreThanOneStandingDivider(frames)).toEqual([]);
  expect(movesWithinFromTheFirstFrame(frames, 'client', 'card')).toEqual([]);
  expect(movesDownWithin(frames, 'nextClient', 'card')).toEqual([]);
  expect(dividersOffTheTopOf(frames, 'nextRow')).toEqual([]);
  expect(dividersThickerThanOnePx(frames)).toEqual([]);
  expect(dividersLeftAfterRemoval(frames)).toEqual([]);
  return frames;
}

async function signOutTheFirstOlderDeviceWatchingDividers(page: Page): Promise<Frame[]> {
  const { width } = page.viewportSize()!;
  await page.setViewportSize({ width, height: ROOM_FOR_THE_OLDER_QUESTION });
  await openSettings(page, [...signedInDevices, ...longUnusedDevices]);
  const devices = page.locator('.devices');
  await devices.getByRole('button', { name: /Starší \(2\)/ }).click();
  await expect(page.locator('#devices-older .device-name')).toHaveText([
    'iPhone · aplikace',
    'Windows · Edge',
  ]);
  await page
    .locator(olderInstalledAppRow)
    .getByRole('button', { name: /^Odhlásit iPhone · aplikace/ })
    .click();
  const question = devices.getByRole('group', { name: /^Odhlásit iPhone · aplikace/ });
  await expect(question.getByRole('button', { name: 'Zrušit' })).toBeFocused();
  await page.locator(nextOlderRow).scrollIntoViewIfNeeded();
  await settled(page, '.devices');
  await expect(page.locator(olderInstalledAppRow)).toBeInViewport({ ratio: 1 });
  await expect(page.locator(nextOlderRow)).toBeInViewport({ ratio: 1 });

  const frames = await framesWhile(
    page,
    { row: olderInstalledAppRow, next: nextOlderRow },
    () => question.getByRole('button', { name: 'Odhlásit', exact: true }).click(),
    { removed: olderInstalledAppRow, dividers: '#devices-older, #devices-older .device' },
  );

  await expect(page.locator('#devices-older .device-name')).toHaveText(['Windows · Edge']);
  expect(present(frames, 'row').length).toBeGreaterThan(0);
  expect(frames.at(-1)?.boxes['row']).toBeNull();
  expect(doubledLines(frames)).toEqual([]);
  expect(notOneDividerAboveTheNextRow(frames)).toEqual([]);
  expect(jumpOnRemoval(frames)).toEqual([]);
  return frames;
}

function ringPointsCoveredBy(page: Page, row: string): Promise<string[]> {
  return page.evaluate(
    ({ row }) => {
      const focused = document.activeElement;
      const covering = document.querySelector(row);
      if (!(focused instanceof HTMLElement) || covering === null) {
        return [`no focused control or no ${row}`];
      }
      const style = getComputedStyle(focused);
      const width = parseFloat(style.outlineWidth);
      if (style.outlineStyle === 'none' || !(width > 0)) {
        return ['the focused control shows no ring'];
      }
      const middle = parseFloat(style.outlineOffset) + width / 2;
      const box = focused.getBoundingClientRect();
      const left = box.left - middle;
      const right = box.right + middle;
      const top = box.top - middle;
      const bottom = box.bottom + middle;
      const along = [0.1, 0.3, 0.5, 0.7, 0.9];
      const points = [
        ...along.map((share) => [left + (right - left) * share, top]),
        ...along.map((share) => [left + (right - left) * share, bottom]),
        ...along.map((share) => [left, top + (bottom - top) * share]),
        ...along.map((share) => [right, top + (bottom - top) * share]),
      ];
      return points.flatMap(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit === null
          ? [`nothing at ${x}, ${y} on the ring`]
          : covering.contains(hit)
            ? [`${row} covers the ring at ${x}, ${y}`]
            : [];
      });
    },
    { row },
  );
}

async function disconnectClaude(page: Page): Promise<Frame[]> {
  const connections = page.locator('.connections');
  await settled(page, '.connections');
  await recordRowsShownAgain(page, '.connection-slot', 'connection-slot--leaving');

  const frames = await framesWhile(
    page,
    { row: claudeConnectionRow, card: '.connections' },
    () => page.locator(claudeConnectionRow).getByRole('button', { name: 'Odpojit' }).click(),
    { removed: claudeConnectionRow },
  );

  await expect(connections.locator('.connection-client')).toHaveText(['chatgpt.com']);
  await expect(connections.getByRole('heading', { name: 'Připojené aplikace' })).toBeFocused();
  expectOnlyClosedUntilRemoved(frames, await rowsShownAgain(page));
  return frames;
}

test.describe('Given a donor in Údaje a zabezpečení with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize(COMPUTER);
    }
  });

  test('when they confirm Odhlásit for the iPhone, then its row only closes and fades until it is removed, and the card never rises above the height it ends at', async ({
    page,
  }) => {
    await openSettings(page);

    const frames = await confirmSigningOutTheIPhone(page);

    expect(growths(frames, 'row', 'height')).toEqual([]);
    expect(risesAboveTheEnd(frames, 'card')).toEqual([]);
  });

  test('when they close Změnit heslo, then the card only shrinks and its last frame already stands at the height it ends at', async ({
    page,
  }) => {
    await openSettings(page);
    const card = 'app-account-card .ui-card';
    const panel = '#account-password-panel';
    const toggle = page.locator('dd.account-actions').getByRole('button', { name: 'Změnit heslo' });
    const open = async (): Promise<void> => {
      await toggle.click();
      await expect(page.locator(panel).getByLabel('Současné heslo')).toBeFocused();
      await settled(page, card);
    };

    await open();
    const frames = await framesWhile(page, { card }, () => toggle.click());
    await settled(page, card);
    const closed = await heightOf(page, card);
    await open();
    const end = await heightAtTheEndOfTheClose(page, card, panel, () => toggle.click());

    expect(growths(frames, 'card', 'height')).toEqual([]);
    expect(Math.abs(end - closed)).toBeLessThanOrEqual(SUBPIXEL_PX);
  });

  test('when they fold Starší away, then the card only shrinks and its last frame already stands at the height it ends at', async ({
    page,
  }) => {
    await openSettings(page, [...signedInDevices, ...longUnusedDevices]);
    const older = page.locator('.devices').getByRole('button', { name: /Starší \(2\)/ });
    const unfold = async (): Promise<void> => {
      await older.click();
      await expect(page.locator('#devices-older .device-name')).toHaveText([
        'iPhone · aplikace',
        'Windows · Edge',
      ]);
      await settled(page, '.devices');
    };

    await unfold();
    await recordLeavingRows(page, '.device-slot', 'device-slot--leaving');
    const frames = await framesWhile(page, { card: '.devices' }, () => older.click(), {
      removed: '#devices-older',
    });
    await expect(page.locator('#devices-older')).toHaveCount(0);
    await settled(page, '.devices');
    const folded = await heightOf(page, '.devices');
    await unfold();
    const end = await heightAtTheEndOfTheClose(page, '.devices', 'li.devices-older', () =>
      older.click(),
    );

    expect(growths(frames, 'card', 'height')).toEqual([]);
    expect(Math.abs(end - folded)).toBeLessThanOrEqual(SUBPIXEL_PX);
    expect(await leavingRows(page)).toEqual([]);
  });

  test('when they confirm Ano, odebrat for the iPhone passkey, then its row only closes and fades until it is removed, and the card never rises above the height it ends at', async ({
    page,
  }) => {
    await openSettingsWithTwoPasskeys(page);

    const frames = await confirmRemovingTheIPhonePasskey(page);

    expect(growths(frames, 'row', 'height')).toEqual([]);
    expect(risesAboveTheEnd(frames, 'card')).toEqual([]);
  });

  test('when they sign out the first device in Starší, then one divider stands above the next row in every frame of its leave, and that row does not jump when it is removed', async ({
    page,
  }) => {
    await signOutTheFirstOlderDeviceWatchingDividers(page);
  });

  test('when they remove their last passkey, then the card stands still once the empty text shows', async ({
    page,
  }) => {
    await openSettingsWithPasskeys(page, [iphonePasskey]);
    const row = page.locator(iphonePasskeyRow);
    await row.getByRole('button', { name: 'Odebrat' }).click();
    const confirm = row.getByRole('button', { name: 'Ano, odebrat' });
    await expect(confirm).toBeVisible();
    await settled(page, 'app-account-card .ui-card');

    const frames = await framesWhile(
      page,
      { row: iphonePasskeyRow, card: 'app-account-card .ui-card', empty: '.passkeys-empty' },
      () => confirm.click(),
    );

    await expect(page.locator('.passkey-name')).toHaveCount(0);
    expect(present(frames, 'empty').some(({ box }) => box.opacity > GONE_OPACITY)).toBe(true);
    expect(frames.at(-1)?.boxes['row']).toBeNull();
    expect(movesAfterTheEmptyTextShows(frames, 'card')).toEqual([]);
  });

  test('when they disconnect claude.ai, then its row only closes and fades until it is removed, and the card never rises above the height it ends at', async ({
    page,
  }) => {
    await openSettingsWithTwoConnections(page);

    const frames = await disconnectClaude(page);

    expect(growths(frames, 'row', 'height')).toEqual([]);
    expect(risesAboveTheEnd(frames, 'card')).toEqual([]);
  });

  test('when they disconnect claude.ai, then its row closes like every other row, the divider above chatgpt.com stands at its bottom edge and fades with it, and none is left once it is removed', async ({
    page,
  }) => {
    const frames = await disconnectClaudeWatchingDividers(page);

    expect(notOneDividerOnTheRowsBottom(frames)).toEqual([]);
    expect(movesWithinFromTheFirstFrame(frames, 'client', 'card')).toEqual([]);
    expect(movesDownWithin(frames, 'nextClient', 'card')).toEqual([]);
  });

  test('when they disconnect chatgpt.com below claude.ai, then the one divider between them stays in its place while chatgpt.com stands, fades with it and is gone once it is removed, and neither name moves', async ({
    page,
  }) => {
    await disconnectChatGptWatchingDividers(page);
  });

  test("when claude.ai and chatgpt.com were both disconnected elsewhere and Údaje a zabezpečení open again, then both rows leave at once with at most one divider between them, on chatgpt.com's top, and none is left", async ({
    page,
  }) => {
    await bothConnectionsLeaveOnReturnWatchingDividers(page);
  });

  test('when the iPhone was signed out elsewhere and Údaje a zabezpečení open again, then its row is out of reach for as long as it leaves', async ({
    page,
  }) => {
    const list = await openSettings(page);
    await expect(page.locator(otherRow)).toBeVisible();
    await openDonorSection(page, 'Můj přehled');
    list(signedInDevices.filter((device) => device.current));
    await recordLeavingRows(page, '.device-slot', 'device-slot--leaving');

    await openDonorSection(page, 'Údaje a zabezpečení');

    await expect(page.locator('.devices .device-name')).toHaveText(['Mac · Safari']);
    expect(await leavingRows(page)).toEqual([{ id: otherRow.slice(1), inert: true }]);
  });

  test('when the iPhone passkey was removed elsewhere and Údaje a zabezpečení open again, then its row is out of reach for as long as it leaves', async ({
    page,
  }) => {
    const removeTheIPhone = await openSettingsWithTwoPasskeys(page);
    await openDonorSection(page, 'Můj přehled');
    removeTheIPhone();
    await recordLeavingRows(page, '.passkey-slot', 'passkey-slot--leaving');

    await openDonorSection(page, 'Údaje a zabezpečení');

    await expect(page.locator('.passkey-name')).toHaveText(['Pracovní notebook']);
    expect(await leavingRows(page)).toEqual([{ id: iphonePasskeyRow.slice(1), inert: true }]);
  });

  test('when claude.ai was disconnected elsewhere and Údaje a zabezpečení open again, then its row is out of reach for as long as it leaves', async ({
    page,
  }) => {
    const disconnectElsewhere = await openSettingsWithTwoConnections(page);
    await openDonorSection(page, 'Můj přehled');
    disconnectElsewhere();
    await recordLeavingRows(page, '.connection-slot', 'connection-slot--leaving');

    await openDonorSection(page, 'Údaje a zabezpečení');

    await expect(page.locator('.connection-client')).toHaveText(['chatgpt.com']);
    expect(await leavingRows(page)).toEqual([{ id: claudeConnectionRow.slice(1), inert: true }]);
  });

  test('when they press Odpojit for claude.ai and the second press of a double tap lands on Odpojit of chatgpt.com while claude.ai leaves, then only claude.ai is disconnected', async ({
    page,
    isMobile,
  }) => {
    const disconnected = await openSettingsCountingDisconnects(page);
    await holdTheLeaveOf(page, claudeConnectionRow);
    await page.locator(claudeConnectionRow).getByRole('button', { name: 'Odpojit' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as DoubleTapWatch).leaveHeld))
      .toBe(true);
    const next = page.locator(otherConnectionRow).getByRole('button', { name: 'Odpojit' });

    await (isMobile ? next.tap({ force: true }) : next.click({ force: true }));

    await expect(page.locator('.connection-client')).toHaveText(['chatgpt.com']);
    await expect(page.locator('.connections').getByRole('status')).toContainText(
      'Aplikace claude.ai je odpojená.',
    );
    expect(disconnected).toEqual([claudeConnection.id]);
  });

  test('when the second press of a double tap on Odpojit for claude.ai comes as its row is removed, then it reaches nothing where the first one was, and Odpojit of chatgpt.com answers again a moment later', async ({
    page,
  }) => {
    const disconnected = await expectTheDoubleTapToReachNothingOnRemoval(page);

    await page.locator(otherConnectionRow).getByRole('button', { name: 'Odpojit' }).click();

    await expect(page.locator('.connection-client')).toHaveCount(0);
    expect(disconnected).toEqual([claudeConnection.id, otherConnection.id]);
  });
});

test.describe('Given a donor in Údaje a zabezpečení who asks for less motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test.beforeEach(async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize(COMPUTER);
    }
  });

  test('when they confirm Odhlásit for the iPhone, then its row only fades until it is removed and never comes back', async ({
    page,
  }) => {
    await openSettings(page);

    await confirmSigningOutTheIPhone(page);
  });

  test('when they confirm Ano, odebrat for the iPhone passkey, then its row only fades until it is removed and never comes back', async ({
    page,
  }) => {
    await openSettingsWithTwoPasskeys(page);

    await confirmRemovingTheIPhonePasskey(page);
  });

  test('when they disconnect claude.ai, then its row only fades until it is removed and never comes back', async ({
    page,
  }) => {
    await openSettingsWithTwoConnections(page);

    await disconnectClaude(page);
  });

  test('when they disconnect claude.ai, then the divider above chatgpt.com fades with its row, chatgpt.com never moves down and no divider is left once it is removed', async ({
    page,
  }) => {
    const frames = await disconnectClaudeWatchingDividers(page);

    expect(notOneDividerOnTheRowsBottom(frames)).toEqual([]);
    expect(movesWithinFromTheFirstFrame(frames, 'client', 'card')).toEqual([]);
    expect(movesDownWithin(frames, 'nextClient', 'card')).toEqual([]);
  });

  test('when they sign out the first device in Starší, then one divider stands above the next row in every frame of its fade, and that row moves up by exactly the faded row when it is removed', async ({
    page,
  }) => {
    await signOutTheFirstOlderDeviceWatchingDividers(page);
  });

  test('when they disconnect chatgpt.com below claude.ai, then the one divider between them stays in its place while chatgpt.com stands, fades with it and is gone once it is removed, and neither name moves', async ({
    page,
  }) => {
    await disconnectChatGptWatchingDividers(page);
  });

  test("when claude.ai and chatgpt.com were both disconnected elsewhere and Údaje a zabezpečení open again, then both rows fade at once with at most one 1 px divider between them, on chatgpt.com's top, and none is left", async ({
    page,
  }) => {
    await bothConnectionsLeaveOnReturnWatchingDividers(page);
  });

  test('when they disconnect claude.ai above chatgpt.com and cursor.com, then every divider stays 1 px thick and exactly one stands between chatgpt.com and cursor.com in every frame, the one after the removal included', async ({
    page,
  }) => {
    const { width } = page.viewportSize()!;
    await page.setViewportSize({ width, height: ROOM_FOR_THREE_CONNECTIONS });
    await openSettingsWithConnections(page, [claudeConnection, otherConnection, thirdConnection]);
    const disconnect = page.locator(claudeConnectionRow).getByRole('button', { name: 'Odpojit' });
    await page.locator(thirdConnectionRow).scrollIntoViewIfNeeded();
    await settled(page, '.connections');
    await expect(disconnect).toBeInViewport({ ratio: 1 });
    await expect(page.locator(thirdConnectionRow)).toBeInViewport({ ratio: 1 });

    const frames = await framesWhile(
      page,
      {
        row: claudeConnectionRow,
        card: '.connections',
        nextRow: otherConnectionRow,
        lastRow: thirdConnectionRow,
      },
      () => disconnect.click(),
      { removed: claudeConnectionRow, dividers: '.connection, .connection-slot' },
    );

    await expect(page.locator('.connection-client')).toHaveText(['chatgpt.com', 'cursor.com']);
    expect(present(frames, 'row').length).toBeGreaterThan(0);
    expect(frames.at(-1)?.boxes['row']).toBeNull();
    expect(dividersThickerThanOnePx(frames)).toEqual([]);
    expect(notOneDividerAboveTheLastRow(frames)).toEqual([]);
  });

  test('when they remove their last passkey, then the empty text never stands above the place it ends at, the frame in which the list is removed included, and Přidat přístupový klíč below it never moves down while the row fades', async ({
    page,
  }) => {
    await offerPasskeysAsAnIPhoneDoes(page);
    await openSettingsWithPasskeys(page, [iphonePasskey]);
    const row = page.locator(iphonePasskeyRow);
    await row.getByRole('button', { name: 'Odebrat' }).click();
    const confirm = row.getByRole('button', { name: 'Ano, odebrat' });
    await expect(confirm).toBeVisible();
    await settled(page, 'app-account-card .ui-card');

    const frames = await framesWhile(
      page,
      {
        row: iphonePasskeyRow,
        card: 'app-account-card .ui-card',
        empty: '.passkeys-empty',
        add: '.passkeys > button.passkeys-action',
      },
      () => confirm.click(),
      { removed: '.passkey-list' },
    );

    await expect(page.locator('.passkey-name')).toHaveCount(0);
    expect(present(frames, 'empty').length).toBeGreaterThan(0);
    expect(present(frames, 'add').length).toBe(frames.length);
    expect(frames.at(-1)?.boxes['row']).toBeNull();
    expect(risesAboveItsEndWithin(frames, 'empty', 'card')).toEqual([]);
    expect(movesDownWithin(frames, 'add', 'card')).toEqual([]);
  });

  test('when they remove their last passkey on a phone 375 pt wide showing the largest accessibility text, where the empty text ends taller than the row stands once its question closes, then Přidat přístupový klíč below it never moves down, the frame in which the list is removed included', async ({
    page,
  }) => {
    await showLargestSystemText(page);
    await offerPasskeysAsAnIPhoneDoes(page);
    await openSettingsWithPasskeys(page, [iphonePasskey]);
    await page.setViewportSize(SMALL_PHONE);
    const row = page.locator(iphonePasskeyRow);
    await row.getByRole('button', { name: 'Odebrat' }).click();
    const confirm = row.getByRole('button', { name: 'Ano, odebrat' });
    await expect(confirm).toBeVisible();
    await settled(page, 'app-account-card .ui-card');
    const rowWithItsQuestion = (await row.boundingBox())?.height ?? Infinity;
    const question = (await row.locator('.passkey-confirm').boundingBox())?.height ?? 0;
    const rowOnceItsQuestionCloses = rowWithItsQuestion - question;

    const frames = await framesWhile(
      page,
      {
        row: iphonePasskeyRow,
        card: 'app-account-card .ui-card',
        empty: '.passkeys-empty',
        add: '.passkeys > button.passkeys-action',
      },
      () => confirm.click(),
      { removed: '.passkey-list' },
    );

    await expect(page.locator('.passkey-name')).toHaveCount(0);
    test.info().annotations.push({
      type: 'diagnostic-2044',
      description: JSON.stringify({
        rowWithItsQuestion,
        question,
        rowOnceItsQuestionCloses,
        rows: present(frames, 'row').map(({ at, box }) => [Math.round(at), box.height]),
        empty: frames.at(-1)?.boxes['empty']?.height,
      }),
    });
    expect(frames.at(-1)?.boxes['empty']?.height ?? 0).toBeGreaterThan(rowOnceItsQuestionCloses);
    expect(present(frames, 'add').length).toBe(frames.length);
    expect(frames.at(-1)?.boxes['row']).toBeNull();
    expect(movesDownWithin(frames, 'add', 'card')).toEqual([]);
  });

  test('when the second press of a double tap on Odpojit for claude.ai comes as its row is removed, then it reaches nothing where the first one was, and Odpojit of chatgpt.com answers again a moment later', async ({
    page,
  }) => {
    const disconnected = await expectTheDoubleTapToReachNothingOnRemoval(page);
    expect(disconnected).toEqual([claudeConnection.id]);

    await page.locator(otherConnectionRow).getByRole('button', { name: 'Odpojit' }).click();

    await expect(page.locator('.connection-client')).toHaveCount(0);
    expect(disconnected).toEqual([claudeConnection.id, otherConnection.id]);
  });
});

test.describe('Given a keyboard user in Údaje a zabezpečení with two connected applications', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    if (!isMobile) {
      await page.setViewportSize(COMPUTER);
    }
  });

  test("when Tab moves from Odpojit of claude.ai to Odpojit of chatgpt.com, then claude.ai's row covers no part of the ring", async ({
    page,
  }) => {
    await openSettingsWithTwoConnections(page);
    const next = page.locator(otherConnectionRow).getByRole('button', { name: 'Odpojit' });
    await next.scrollIntoViewIfNeeded();
    await page.locator(claudeConnectionRow).getByRole('button', { name: 'Odpojit' }).focus();

    await page.keyboard.press('Tab');

    await expect(next).toBeFocused();
    await expect(next).toBeInViewport({ ratio: 1 });
    expect(await ringPointsCoveredBy(page, claudeConnectionRow)).toEqual([]);
  });
});
