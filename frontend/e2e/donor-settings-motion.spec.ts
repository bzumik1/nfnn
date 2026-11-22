import { Page } from '@playwright/test';
import {
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

async function openSettings(page: Page, devices = signedInDevices): Promise<void> {
  await mockDonorApi(page);
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
  await signIn(page);
  await openDonorSection(page, 'Údaje a zabezpečení');
  await synced;
  await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
}

test.describe('Given a donor in Údaje a zabezpečení on a device that animates', () => {
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
    expect(
      (await rowsShownAgain(page)).filter(
        (box) => box.opacity > GONE_OPACITY || box.height > SUBPIXEL_PX,
      ),
    ).toEqual([]);
    expect([...growths(frames, 'row', 'height'), ...growths(frames, 'row', 'opacity')]).toEqual([]);
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

  test('when they fold the older sign-ins away, then the card only shrinks and its last frame already stands at the height it ends at', async ({
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
  });
});
