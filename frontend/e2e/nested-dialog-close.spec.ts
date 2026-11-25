import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { bankAccountItem, mockDonorApi, openAccountItem, signIn } from './donor-session';

const BANK_ACCOUNTS = Array.from({ length: 8 }, (_, index) =>
  bankAccountItem({
    id: `0192f0c4-0000-7000-8000-00000000001${index}`,
    accountNumber: `29002333${String(index).padStart(2, '0')}/2010`,
  }),
);

interface NestedDialog {
  readonly section: string;
  readonly opener: string;
  readonly dialog: (page: Page) => Locator;
  readonly settled: (page: Page) => Promise<void>;
}

const NESTED_DIALOGS: readonly NestedDialog[] = [
  {
    section: 'Údaje a zabezpečení',
    opener: 'Smazat data z tohoto zařízení',
    dialog: (page) => page.getByRole('alertdialog', { name: 'Smazat data z tohoto zařízení?' }),
    settled: (page) =>
      expect(page.getByText(/Uloženo v\u00a0zařízení\u00a0· aktualizováno /)).toBeVisible({
        timeout: 10_000,
      }),
  },
  {
    section: 'Bankovní účty',
    opener: 'Přidat bankovní účet',
    dialog: (page) => page.getByRole('dialog', { name: 'Přidat bankovní účet' }),
    settled: async () => undefined,
  },
];

const CLOSES = [
  {
    way: 'Zavřít',
    close: (dialog: Locator) => dialog.locator(':scope > .dialog-panel > .dialog-close').click(),
  },
  { way: 'Esc', close: (dialog: Locator) => dialog.page().keyboard.press('Escape') },
] as const;

interface PanelLayout {
  readonly top: number;
  readonly height: number;
}

function layoutAfterTwoFrames(panel: Locator): Promise<PanelLayout> {
  return panel.evaluate(
    (element) =>
      new Promise<PanelLayout>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve({ top: element.scrollTop, height: element.scrollHeight }),
          ),
        ),
      ),
  );
}

function scrollTopAfterTwoFrames(panel: Locator): Promise<number> {
  return panel.evaluate(
    (element) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(element.scrollTop))),
      ),
  );
}

async function bringIntoMiddle(panel: Locator, opener: Locator): Promise<number> {
  let settled = 0;
  await expect(async () => {
    await opener.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const first = await layoutAfterTwoFrames(panel);
    const second = await layoutAfterTwoFrames(panel);
    expect(second).toEqual(first);
    settled = second.top;
  }).toPass();
  return settled;
}

type Edge = 'bottom' | 'head';

async function cutInHalfBy(edge: Edge, panel: Locator, opener: Locator): Promise<number> {
  let settled = 0;
  await expect(async () => {
    const cut = await opener.evaluate((button, by) => {
      const scroller = button.closest<HTMLElement>('.dialog-panel')!;
      if (by === 'head' && scroller.querySelector('[data-room-below]') === null) {
        const room = document.createElement('div');
        room.setAttribute('data-room-below', '');
        room.style.blockSize = `${scroller.clientHeight}px`;
        scroller.append(room);
      }
      const line = () =>
        by === 'head'
          ? scroller.querySelector('app-sheet-head')!.getBoundingClientRect().bottom
          : Math.min(
              window.innerHeight,
              scroller.getBoundingClientRect().top + scroller.clientTop + scroller.clientHeight,
            );
      const box = button.getBoundingClientRect();
      scroller.scrollBy(0, box.top + box.height / 2 - line());
      const placed = button.getBoundingClientRect();
      return placed.top < line() && placed.bottom > line();
    }, edge);
    expect(cut).toBe(true);
    const first = await layoutAfterTwoFrames(panel);
    const second = await layoutAfterTwoFrames(panel);
    expect(second).toEqual(first);
    settled = second.top;
  }).toPass();
  return settled;
}

async function tapAsSafariDoes(sheet: Locator, opener: Locator): Promise<void> {
  await opener.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  await sheet.evaluate((dialog: HTMLElement) => dialog.focus({ preventScroll: true }));
  await opener.dispatchEvent('click');
}

async function swipeDown(dialog: Locator): Promise<void> {
  const panel = dialog.locator(':scope > .dialog-panel');
  const grabber = panel.locator(':scope > .dialog-grabber');
  await expect(grabber).toBeVisible();
  await expect
    .poll(() =>
      panel.evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
            .filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
  const box = (await grabber.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const mouse = dialog.page().mouse;
  await mouse.move(x, y);
  await mouse.down();
  await mouse.move(x, y + 400, { steps: 20 });
  await mouse.up();
}

const CLOSES_BY_FINGER = [
  { way: 'Zavřít', close: CLOSES[0].close },
  { way: 'a swipe down', close: swipeDown },
] as const;

async function watchScrolls(panel: Locator): Promise<void> {
  await panel.evaluate((element) => {
    element.dataset['scrolledTo'] = '';
    element.addEventListener('scroll', () => {
      element.dataset['scrolledTo'] += ` ${element.scrollTop}`;
    });
  });
}

async function scrollsSeen(panel: Locator): Promise<number[]> {
  const seen = await panel.evaluate((element) => element.dataset['scrolledTo'] ?? '');
  return seen
    .trim()
    .split(/\s+/)
    .filter((value) => value !== '')
    .map(Number);
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`Given a signed-in donor on a phone (${reducedMotion} motion) who has scrolled a section of the account sheet down to a button that opens a dialog inside the sheet`, () => {
    test.use({ viewport: { width: 390, height: 520 }, reducedMotion });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) => route.fulfill({ json: { items: BANK_ACCOUNTS } }),
      );
      await signIn(page);
    });

    for (const nested of NESTED_DIALOGS) {
      for (const { way, close } of CLOSES) {
        test(`when ${nested.opener} is closed with ${way}, then the sheet stays where it was and the focus is back on ${nested.opener}`, async ({
          page,
        }) => {
          await openAccountItem(page, nested.section);
          const sheet = page.getByRole('dialog', { name: nested.section });
          const panel = sheet.locator(':scope > .dialog-panel');
          const opener = panel.getByRole('button', { name: nested.opener, exact: true });
          await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
          await expect(opener).toBeEnabled({ timeout: 10_000 });
          await nested.settled(page);
          const scrolledTo = await bringIntoMiddle(panel, opener);
          expect(scrolledTo).toBeGreaterThan(0);

          await opener.click();
          const dialog = nested.dialog(page);
          await expect(dialog).toBeVisible();
          await watchScrolls(panel);
          await close(dialog);

          await expect(dialog).toHaveCount(0);
          await expect(opener).toBeFocused();
          expect(await scrollTopAfterTwoFrames(panel)).toBe(scrolledTo);
          expect(await scrollsSeen(panel)).toEqual([]);
        });
      }

      for (const [edge, where] of [
        ['bottom', 'the bottom edge of the sheet'],
        ['head', 'the sticky head of the sheet'],
      ] as const) {
        test(`when the visible half of ${nested.opener}, cut by ${where}, is tapped as Safari taps it and the dialog is closed with Zavřít, then the sheet stays where it was and the focus is back on ${nested.opener}`, async ({
          page,
        }) => {
          await openAccountItem(page, nested.section);
          const sheet = page.getByRole('dialog', { name: nested.section });
          const panel = sheet.locator(':scope > .dialog-panel');
          const opener = panel.getByRole('button', { name: nested.opener, exact: true });
          await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
          await expect(opener).toBeEnabled({ timeout: 10_000 });
          await nested.settled(page);
          const scrolledTo = await cutInHalfBy(edge, panel, opener);

          await tapAsSafariDoes(sheet, opener);
          const dialog = nested.dialog(page);
          await expect(dialog).toBeVisible();
          await watchScrolls(panel);
          await CLOSES[0].close(dialog);

          await expect(dialog).toHaveCount(0);
          await expect(opener).toBeFocused();
          expect(await scrollTopAfterTwoFrames(panel)).toBe(scrolledTo);
          expect(await scrollsSeen(panel)).toEqual([]);
        });
      }

      for (const { way, close } of CLOSES_BY_FINGER) {
        test(`when ${nested.opener} kept the focus from an earlier close, its visible half under the sticky head of the sheet is tapped as Safari taps it and the dialog is closed with ${way}, then the sheet stays where it was and the focus is back on ${nested.opener}`, async ({
          page,
        }) => {
          await openAccountItem(page, nested.section);
          const sheet = page.getByRole('dialog', { name: nested.section });
          const panel = sheet.locator(':scope > .dialog-panel');
          const opener = panel.getByRole('button', { name: nested.opener, exact: true });
          await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
          await expect(opener).toBeEnabled({ timeout: 10_000 });
          await nested.settled(page);
          await opener.evaluate((button: HTMLElement) => button.focus({ preventScroll: true }));
          await expect(opener).toBeFocused();
          const scrolledTo = await cutInHalfBy('head', panel, opener);

          await opener.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
          await sheet.evaluate((dialog: HTMLElement) => dialog.focus({ preventScroll: true }));
          await expect(opener).toBeFocused();
          await opener.dispatchEvent('click');
          const dialog = nested.dialog(page);
          await expect(dialog).toBeVisible();
          await watchScrolls(panel);
          await close(dialog);

          await expect(dialog).toHaveCount(0);
          await expect(opener).toBeFocused();
          expect(await scrollTopAfterTwoFrames(panel)).toBe(scrolledTo);
          expect(await scrollsSeen(panel)).toEqual([]);
        });
      }

      test(`when the visible half of ${nested.opener}, cut by the sticky head of the sheet, is tapped as Safari taps it and the dialog is closed with Esc, then the focus is back on ${nested.opener} and it is brought below the head`, async ({
        page,
      }) => {
        await openAccountItem(page, nested.section);
        const sheet = page.getByRole('dialog', { name: nested.section });
        const panel = sheet.locator(':scope > .dialog-panel');
        const opener = panel.getByRole('button', { name: nested.opener, exact: true });
        await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
        await expect(opener).toBeEnabled({ timeout: 10_000 });
        await nested.settled(page);
        await cutInHalfBy('head', panel, opener);

        await tapAsSafariDoes(sheet, opener);
        const dialog = nested.dialog(page);
        await expect(dialog).toBeVisible();
        await CLOSES[1].close(dialog);

        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
        await expect(async () => {
          const place = await opener.evaluate((button) => ({
            top: button.getBoundingClientRect().top,
            headBottom: button
              .closest('.dialog-panel')!
              .querySelector('app-sheet-head')!
              .getBoundingClientRect().bottom,
          }));
          expect(place.top).toBeGreaterThanOrEqual(place.headBottom);
        }).toPass();
      });
    }
  });
}
