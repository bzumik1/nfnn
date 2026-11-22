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

interface Box {
  readonly top: number;
  readonly height: number;
  readonly opacity: number;
}

interface Line {
  readonly top: number;
  readonly alpha: number;
}

interface Frame {
  readonly at: number;
  readonly boxes: Readonly<Record<string, Box | null>>;
  readonly lines: readonly Line[];
}

interface FrameWatch {
  settingsFrames: Frame[];
  settingsWatched: boolean;
}

const COMPUTER = { width: 1280, height: 800 };
const WATCHED_MS = 1000;
const SUBPIXEL_PX = 0.5;
const GONE_OPACITY = 0.01;
const SHOWING_OPACITY = 0.05;
const STANDING_OPACITY = 0.5;
const ONE_LINE_PX = 2;

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
const claudeConnectionRow = `#connection-row-${claudeConnection.id}`;
const otherConnectionRow = `#connection-row-${otherConnection.id}`;

interface DoubleTapWatch {
  leaveHeld: boolean;
  pressedOnRemoval: string | null | undefined;
}

async function framesWhile(
  page: Page,
  watched: Record<string, string>,
  act: () => Promise<void>,
  dividers: string | null = null,
): Promise<Frame[]> {
  await page.evaluate(
    ({ watched, watchedMs, dividers }) => {
      const watch = window as unknown as FrameWatch;
      watch.settingsFrames = [];
      watch.settingsWatched = false;
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
        return bottom > top ? [{ top, alpha }] : [];
      };
      const drawnLines = (): Line[] =>
        dividers === null
          ? []
          : [...document.querySelectorAll(dividers)].flatMap((element) => {
              const style = getComputedStyle(element);
              const box = element.getBoundingClientRect();
              const above = parseFloat(style.borderTopWidth);
              const below = parseFloat(style.borderBottomWidth);
              const after = getComputedStyle(element, '::after');
              const belowAfter = after.content === 'none' ? 0 : parseFloat(after.borderBottomWidth);
              return [
                ...(above > 0 ? drawnLine(element, box.top, above) : []),
                ...(below > 0 ? drawnLine(element, box.bottom - below, below) : []),
                ...(belowAfter > 0 ? drawnLine(element, box.bottom - belowAfter, belowAfter) : []),
              ];
            });
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
        watch.settingsFrames.push({ at: frameTime - began, boxes, lines: drawnLines() });
        if (performance.now() - began < watchedMs) {
          requestAnimationFrame(sample);
        } else {
          watch.settingsWatched = true;
        }
      };
      requestAnimationFrame(sample);
    },
    { watched, watchedMs: WATCHED_MS, dividers },
  );
  await act();
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

function noDividerAtTheClipBottom(frames: readonly Frame[]): string[] {
  return frames.flatMap(({ at, boxes, lines }) => {
    const row = boxes['row'];
    const clip = boxes['clip'];
    const nextRow = boxes['nextRow'];
    if (row === null || clip === null || nextRow === null || row.opacity <= STANDING_OPACITY) {
      return [];
    }
    const bottom = clip.top + clip.height;
    const atTheEdge = lines.some(
      (line) => line.alpha > STANDING_OPACITY && Math.abs(line.top - bottom) < ONE_LINE_PX,
    );
    return [
      ...(atTheEdge ? [] : [`no divider at the clip's bottom ${bottom} at +${Math.round(at)} ms`]),
      ...(Math.abs(bottom - nextRow.top) <= SUBPIXEL_PX
        ? []
        : [
            `clip bottom ${bottom} apart from the next row's top ${nextRow.top} at +${Math.round(at)} ms`,
          ]),
    ];
  });
}

function movesFromTheFirstFrame(frames: readonly Frame[], name: string): string[] {
  const shown = present(frames, name);
  const first = shown[0]?.box.top;
  return shown.flatMap(({ at, box }) =>
    Math.abs(box.top - first) <= SUBPIXEL_PX
      ? []
      : [`${name} top ${first} → ${box.top} at +${Math.round(at)} ms`],
  );
}

function movesDown(frames: readonly Frame[], name: string): string[] {
  const shown = present(frames, name);
  return shown.flatMap(({ at, box }, index) =>
    index > 0 && box.top > shown[index - 1].box.top + SUBPIXEL_PX
      ? [`${name} top ${shown[index - 1].box.top} → ${box.top} at +${Math.round(at)} ms`]
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
  return (devices) => (listed = devices);
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

  const frames = await framesWhile(page, { row: otherRow, card: '.devices' }, () =>
    question.getByRole('button', { name: 'Odhlásit', exact: true }).click(),
  );

  await expect(devices.locator('.device-name')).toHaveText(['Mac · Safari']);
  await expect(devices.getByRole('heading', { name: 'Přihlášená zařízení' })).toBeFocused();
  expectOnlyClosedUntilRemoved(frames, await rowsShownAgain(page));
  return frames;
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
  );

  await expect(page.locator('.passkey-name')).toHaveText(['Pracovní notebook']);
  await expect(page.locator(`#passkey-rename-button-${notebookPasskey.id}`)).toBeFocused();
  expectOnlyClosedUntilRemoved(frames, await rowsShownAgain(page));
  return frames;
}

async function openSettingsWithTwoConnections(page: Page): Promise<() => void> {
  let listed = [claudeConnection, otherConnection];
  const disconnectClaudeElsewhere = (): void => {
    listed = listed.filter((connection) => connection.id !== claudeConnection.id);
  };
  await openSettings(page, signedInDevices, administrator, async () => {
    await page.route(
      (url) => url.pathname === '/api/donors/me/connections',
      (route) => route.fulfill({ json: { items: listed } }),
    );
    await page.route(
      (url) => url.pathname === `/api/donors/me/connections/${claudeConnection.id}`,
      async (route) => {
        disconnectClaudeElsewhere();
        await route.fulfill({ status: 204 });
      },
    );
  });
  await expect(page.locator('.connection-client')).toHaveText(['claude.ai', 'chatgpt.com']);
  return disconnectClaudeElsewhere;
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
  await openSettingsWithTwoConnections(page);
  await settled(page, '.connections');

  const frames = await framesWhile(
    page,
    {
      row: claudeConnectionRow,
      clip: `${claudeConnectionRow} > div`,
      client: `${claudeConnectionRow} .connection-client`,
      next: `${otherConnectionRow} .connection-body`,
      nextRow: otherConnectionRow,
      nextClient: `${otherConnectionRow} .connection-client`,
    },
    () => page.locator(claudeConnectionRow).getByRole('button', { name: 'Odpojit' }).click(),
    `.connection, ${claudeConnectionRow} > div`,
  );

  await expect(page.locator('.connection-client')).toHaveText(['chatgpt.com']);
  expect(present(frames, 'row').length).toBeGreaterThan(0);
  expect(frames.at(-1)?.boxes['row']).toBeNull();
  expect(linesOutlastingTheRow(frames)).toEqual([]);
  expect(dividersLeftAfterRemoval(frames)).toEqual([]);
  return frames;
}

async function disconnectClaude(page: Page): Promise<Frame[]> {
  const connections = page.locator('.connections');
  await settled(page, '.connections');
  await recordRowsShownAgain(page, '.connection-slot', 'connection-slot--leaving');

  const frames = await framesWhile(page, { row: claudeConnectionRow, card: '.connections' }, () =>
    page.locator(claudeConnectionRow).getByRole('button', { name: 'Odpojit' }).click(),
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
    const frames = await framesWhile(page, { card: '.devices' }, () => older.click());
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
    await settled(page, '.devices');

    const frames = await framesWhile(
      page,
      { row: olderInstalledAppRow, next: nextOlderRow },
      () => question.getByRole('button', { name: 'Odhlásit', exact: true }).click(),
      '#devices-older, #devices-older .device',
    );

    await expect(page.locator('#devices-older .device-name')).toHaveText(['Windows · Edge']);
    expect(present(frames, 'row').length).toBeGreaterThan(0);
    expect(frames.at(-1)?.boxes['row']).toBeNull();
    expect(doubledLines(frames)).toEqual([]);
    expect(notOneDividerAboveTheNextRow(frames)).toEqual([]);
    expect(jumpOnRemoval(frames)).toEqual([]);
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

    expect(noDividerAtTheClipBottom(frames)).toEqual([]);
    expect(movesFromTheFirstFrame(frames, 'client')).toEqual([]);
    expect(movesDown(frames, 'nextClient')).toEqual([]);
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
    const disconnectClaudeElsewhere = await openSettingsWithTwoConnections(page);
    await openDonorSection(page, 'Můj přehled');
    disconnectClaudeElsewhere();
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

    expect(noDividerAtTheClipBottom(frames)).toEqual([]);
    expect(movesFromTheFirstFrame(frames, 'client')).toEqual([]);
    expect(movesDown(frames, 'nextClient')).toEqual([]);
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
