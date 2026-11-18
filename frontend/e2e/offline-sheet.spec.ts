import type { BrowserContext, Page, Route } from '@playwright/test';
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

test.describe('Given a visitor without a service worker whose connection drops before the page had an idle moment', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, 'requestIdleCallback', { value: () => 0 }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
    await dropTheConnection(page, context);
  });

  test('when they press the offline label, then the page says the part could not be opened, and a press once the network is back opens the sheet', async ({
    page,
    context,
  }) => {
    const label = page.getByRole('button', { name: /^Offline/ });
    await label.click();

    const reload = page.getByRole('button', { name: 'Načíst znovu' });
    await expect(page.getByText('Stránku se nepodařilo otevřít.')).toBeVisible();
    await expect(reload).toBeFocused();
    await expect(reload).toHaveAccessibleDescription(
      'Stránku se nepodařilo otevřít. Web byl mezitím možná aktualizován nebo vypadlo připojení. Zkuste ji načíst znovu.',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await context.setOffline(false);
    await label.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 2 })).toBeVisible();
  });
});
