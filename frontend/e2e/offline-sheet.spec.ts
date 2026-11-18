import type { BrowserContext, Locator, Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { requestsInFlight, settled } from './settled';

const DISCONNECTED = (route: Route) => route.abort('internetdisconnected');
const SETTLE_BOUND_MS = 10_000;
const ENTRY_BOUND_MS = 3_000;

interface SheetFrame {
  readonly open: boolean;
  readonly opacity: number | null;
  readonly panel: { readonly top: number; readonly height: number } | null;
  readonly moving: boolean;
}

async function openHomeAndLetItIdle(page: Page): Promise<void> {
  const inFlight = requestsInFlight(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
  await page.evaluate(
    () => new Promise((idle) => (window.requestIdleCallback ?? setTimeout)(() => idle(null))),
  );
  await settled(page, inFlight, SETTLE_BOUND_MS);
}

async function dropTheConnection(page: Page, context: BrowserContext): Promise<void> {
  await page.route('**/api/**', DISCONNECTED);
  await context.setOffline(true);
}

async function recordSheetFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frames: SheetFrame[] = [];
    Object.assign(window, { sheetFrames: frames });
    const record = () => {
      const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
      const box = dialog?.querySelector<HTMLElement>('.dialog-panel')?.getBoundingClientRect();
      frames.push({
        open: dialog !== null,
        opacity: dialog ? Number(getComputedStyle(dialog).opacity) : null,
        panel: box ? { top: box.top, height: box.height } : null,
        moving: dialog !== null && dialog.getAnimations({ subtree: true }).length > 0,
      });
      const lastTwo = frames.slice(-2);
      const resting = lastTwo.length === 2 && lastTwo.every((frame) => frame.open && !frame.moving);
      if (!resting) {
        requestAnimationFrame(record);
      }
    };
    requestAnimationFrame(record);
  });
}

function sheetFrames(page: Page): Promise<SheetFrame[]> {
  return page.evaluate(() => (window as unknown as { sheetFrames: SheetFrame[] }).sheetFrames);
}

test.describe('Given a visitor whose connection drops after the first screen, without a service worker', () => {
  test.beforeEach(async ({ page, context }) => {
    await openHomeAndLetItIdle(page);
    await dropTheConnection(page, context);
  });

  test('when they press the offline label, then the sheet opens from what the page fetched while it was idle', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /^Offline/ }).click();

    const sheet = page.getByRole('dialog', { name: 'Jste offline' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Bez připojení můžete jen prohlížet.');
    await expect(sheet.getByRole('button', { name: 'Zkusit znovu' })).toBeVisible();
  });

  for (const width of [390, 1280]) {
    test(`when the sheet opens for the first time at ${width} px, then its first frame is already part of its entry and it never shows whole and then gone`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await recordSheetFrames(page);

      await page.getByRole('button', { name: /^Offline/ }).click();

      await expect
        .poll(
          async () => (await sheetFrames(page)).filter((frame) => frame.open && !frame.moving),
          { timeout: ENTRY_BOUND_MS },
        )
        .toHaveLength(2);
      const frames = await sheetFrames(page);
      const shown = frames.slice(frames.findIndex((frame) => frame.open));
      const first = shown[0];
      const rest = shown[shown.length - 1];
      expect(
        shown.every((frame) => frame.open),
        'the sheet never disappears while it opens',
      ).toBe(true);
      expect(first.moving, 'the first frame of the open sheet is part of its entry').toBe(true);
      const startsAway =
        first.opacity! < 1 ||
        first.panel!.top - rest.panel!.top > 0.5 ||
        Math.abs(first.panel!.height - rest.panel!.height) > 0.5;
      expect(startsAway, 'the first frame is not yet the sheet at rest').toBe(true);
    });
  }
});

interface PulseRecord {
  pressedAt: number | null;
  startedAt: number | null;
  stoppedAt: number | null;
}

const BEFORE_IDLE = () => Object.defineProperty(window, 'requestIdleCallback', { value: () => 0 });
const SERVER_DOWN = (route: Route) =>
  route.fulfill({ status: 522, contentType: 'text/html', body: 'origin down' });
const CODE_GONE = (route: Route) => route.abort('connectionrefused');
const OFFLINE_SETTLED = { timeout: 10_000 };

async function recordPulse(label: Locator): Promise<void> {
  await label.evaluate((pill) => {
    const record: PulseRecord = { pressedAt: null, startedAt: null, stoppedAt: null };
    Object.assign(window, { pulseRecord: record });
    pill.addEventListener('pointerdown', (event) => (record.pressedAt ??= event.timeStamp));
    const watch = () => {
      const pulse = pill
        .getAnimations()
        .find((animation) => (animation as CSSAnimation).animationName === 'motion-pulse');
      if (pulse !== undefined && record.startedAt === null && pulse.startTime !== null) {
        record.startedAt = Number(pulse.startTime);
      }
      if (record.startedAt !== null && pulse === undefined) {
        record.stoppedAt = performance.now();
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

function pulseRecord(page: Page): Promise<PulseRecord> {
  return page.evaluate(() => (window as unknown as { pulseRecord: PulseRecord }).pulseRecord);
}

function themeMs(page: Page, token: string): Promise<number> {
  return page.evaluate(
    (name) =>
      Math.round(
        Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 1000,
      ),
    token,
  );
}

async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

async function recordAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const region = document.querySelector('app-offline-status [aria-live="polite"]')!;
    const said: string[] = [];
    Object.assign(window, { offlineAnnouncements: said, pageKept: true });
    new MutationObserver(() =>
      said.push(region.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
    ).observe(region, { childList: true, subtree: true, characterData: true });
  });
}

function announcements(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { offlineAnnouncements: string[] }).offlineAnnouncements,
  );
}

function pageKept(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { pageKept?: boolean }).pageKept === true);
}

test.describe('Given a visitor without a service worker whose connection drops before the page had an idle moment', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.addInitScript(BEFORE_IDLE);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
    await dropTheConnection(page, context);
  });

  test('when they press the offline label, then the page says again that it is offline, keeps the focus on the label, shows no reload notice and does not reload, and a press once the network is back opens the sheet', async ({
    page,
    context,
  }) => {
    const label = page.getByRole('button', { name: /^Offline/ });
    await expect(label).toBeVisible();
    await recordAnnouncements(page);

    await label.click();

    await expect
      .poll(() => announcements(page))
      .toEqual(['', expect.stringMatching(/^Jste offline\./)]);
    await expect(label).toBeFocused();
    await expect(page.getByRole('button', { name: 'Načíst znovu' })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await pageKept(page)).toBe(true);

    await label.click();
    await expect
      .poll(() => announcements(page))
      .toEqual([
        '',
        expect.stringMatching(/^Jste offline\./),
        '',
        expect.stringMatching(/^Jste offline\./),
      ]);

    await context.setOffline(false);
    await label.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toBeVisible();
  });

  test('when they press the offline label, then the label pulses at once and for at least one whole breath, though the load fails at once', async ({
    page,
  }) => {
    const label = page.getByRole('button', { name: /^Offline/ });
    await expect(label).toBeVisible();
    await recordPulse(label);

    await label.click();

    await expect.poll(async () => (await pulseRecord(page)).stoppedAt).not.toBeNull();
    const { pressedAt, startedAt, stoppedAt } = await pulseRecord(page);
    expect(startedAt! - pressedAt!, 'it starts at once').toBeLessThan(
      await themeMs(page, '--delay-loading'),
    );
    expect(stoppedAt! - startedAt!, 'it runs one whole breath').toBeGreaterThanOrEqual(
      await themeMs(page, '--duration-pulse'),
    );
  });

  test('when they ask for less motion and press the offline label, then the label does not pulse', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const label = page.getByRole('button', { name: /^Offline/ });
    await expect(label).toBeVisible();
    await recordPulse(label);
    await recordAnnouncements(page);

    await label.click();

    await expect.poll(() => announcements(page)).toHaveLength(2);
    await nextFrames(page);
    expect((await pulseRecord(page)).startedAt).toBeNull();
  });
});

test.describe('Given a visitor without a service worker whose network works but whose server stops answering before the page had an idle moment', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(BEFORE_IDLE);
    await page.route('**/api/**', SERVER_DOWN);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Offline/ })).toBeVisible(OFFLINE_SETTLED);
  });

  test('when the code of the sheet cannot be loaded, then the reload notice shows, and once the code loads again a press opens the sheet and the notice goes', async ({
    page,
  }) => {
    const label = page.getByRole('button', { name: /^Offline/ });
    await page.route('**/chunk-*.js', CODE_GONE);

    await label.click();

    const notice = page.getByText('Stránku se nepodařilo otevřít.');
    await expect(notice).toBeVisible();
    await expect(page.getByRole('button', { name: 'Načíst znovu' })).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.unroute('**/chunk-*.js', CODE_GONE);
    await label.click();

    await expect(page.getByRole('dialog', { name: 'Server neodpovídá' })).toBeVisible();
    await expect(notice).toHaveCount(0);
  });

  test('when the sheet loads quickly, then it opens without the label pulsing', async ({
    page,
  }) => {
    const label = page.getByRole('button', { name: /^Offline/ });
    await recordPulse(label);

    await label.click();

    await expect(page.getByRole('dialog', { name: 'Server neodpovídá' })).toBeVisible();
    await nextFrames(page);
    expect((await pulseRecord(page)).startedAt).toBeNull();
  });
});
