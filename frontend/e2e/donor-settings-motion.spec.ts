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
  readonly height: number;
  readonly opacity: number;
}

interface Frame {
  readonly at: number;
  readonly boxes: Readonly<Record<string, Box | null>>;
}

interface FrameWatch {
  settingsFrames: Frame[];
  settingsWatched: boolean;
}

const COMPUTER = { width: 1280, height: 800 };
const WATCHED_MS = 1000;
const SUBPIXEL_PX = 0.5;
const GONE_OPACITY = 0.01;

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
): Promise<Frame[]> {
  await page.evaluate(
    ({ watched, watchedMs }) => {
      const watch = window as unknown as FrameWatch;
      watch.settingsFrames = [];
      watch.settingsWatched = false;
      const began = performance.now();
      const sample = (frameTime: DOMHighResTimeStamp): void => {
        const boxes: Record<string, Box | null> = {};
        for (const [name, selector] of Object.entries(watched)) {
          const element = document.querySelector(selector);
          boxes[name] =
            element === null
              ? null
              : {
                  height: element.getBoundingClientRect().height,
                  opacity: Number(getComputedStyle(element).opacity),
                };
        }
        watch.settingsFrames.push({ at: frameTime - began, boxes });
        if (performance.now() - began < watchedMs) {
          requestAnimationFrame(sample);
        } else {
          watch.settingsWatched = true;
        }
      };
      requestAnimationFrame(sample);
    },
    { watched, watchedMs: WATCHED_MS },
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
      listed = listed.filter((device) => device.id !== otherDevice?.id);
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

async function openSettingsWithTwoPasskeys(page: Page): Promise<() => void> {
  let listed = [iphonePasskey, notebookPasskey];
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
  await expect(page.locator('.passkey-name')).toHaveText(['iPhone', 'Pracovní notebook']);
  return removeTheIPhone;
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

  test('when they disconnect claude.ai, then its row only closes and fades until it is removed, and the card never rises above the height it ends at', async ({
    page,
  }) => {
    await openSettingsWithTwoConnections(page);

    const frames = await disconnectClaude(page);

    expect(growths(frames, 'row', 'height')).toEqual([]);
    expect(risesAboveTheEnd(frames, 'card')).toEqual([]);
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

  test('when the second press of a double tap on Odpojit for claude.ai comes as its row is removed, then it reaches nothing where the first one was', async ({
    page,
  }) => {
    const disconnected = await expectTheDoubleTapToReachNothingOnRemoval(page);

    expect(disconnected).toEqual([claudeConnection.id]);
  });
});
