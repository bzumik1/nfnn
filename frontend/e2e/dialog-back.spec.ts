import { Locator, Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { browserEntries, stepBack } from './app-history';
import { administrator, mockDonorApi, openAccountItem, session } from './donor-session';

const PAYMENTS = '/api/admin/donations/payments';
const SHEET_FLICK_REST_MS = 100;
const PAYMENT_ID = '019a1c00-0000-7000-8000-000000001001';

const unpaired = {
  id: PAYMENT_ID,
  bankTransactionId: 1001,
  bookedOn: '2026-10-10',
  amountMinor: 50000,
  currency: 'CZK',
  variableSymbol: '1111111111',
  counterpartyAccount: '2900233333/2010',
  counterpartyName: 'Nováková Jana',
  messageForRecipient: 'Dar pro fond',
  importedAt: '2026-10-17T10:00:00Z',
  unpairedByAdminAt: null,
  accountVerification: false,
  donation: null,
};

async function openPayments(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
  await page.goto('/');
  await openAccountItem(page, 'Správa');
  await expect(page).toHaveURL(/\/sprava$/);
  await page.getByRole('link', { name: 'Platby z banky' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeVisible();
  await page.evaluate(() => ((window as unknown as Probe).dialogEntries = 0));
}

interface Probe {
  dialogEntries: number;
  pops: number;
}

async function countDialogEntries(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = window as unknown as { dialogEntries: number; pops: number };
    record.dialogEntries = 0;
    record.pops = 0;
    window.addEventListener('popstate', () => record.pops++, { capture: true });
    document.addEventListener('DOMContentLoaded', () => {
      const pushState = history.pushState.bind(history);
      history.pushState = (state: unknown, title: string, url?: string | URL | null) => {
        if (typeof state === 'object' && state !== null && 'nfnnDialogDepth' in state) {
          record.dialogEntries++;
        }
        pushState(state, title, url);
      };
    });
  });
}

function dialogEntries(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as Probe).dialogEntries);
}

async function entryTakenBack(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (history.state as Record<string, unknown>)['nfnnDialogDepth']))
    .toBeUndefined();
}

async function sheetSettled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.locator('.dialog-panel').evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
            .filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
}

async function restLongerThanAFlick(page: Page): Promise<void> {
  const restStartedAt = await page.evaluate(() => performance.now());
  await expect
    .poll(() => page.evaluate(() => performance.now()))
    .toBeGreaterThan(restStartedAt + SHEET_FLICK_REST_MS);
}

async function fingerTo(
  target: Locator,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number,
  touching = true,
): Promise<void> {
  const finger = { identifier: 1, clientX: x, clientY: y };
  await target.dispatchEvent(type, {
    touches: touching ? [finger] : [],
    changedTouches: [finger],
    bubbles: true,
    cancelable: true,
  });
}

interface SheetLeave {
  slideFrom: number | null;
  slideTo: string | null;
  slideDuration: number;
  slideEndedAt: number | null;
  veilAtEnd: number | null;
  blurAtEnd: number | null;
  removedAt: number | null;
}

async function watchSheetLeave(page: Page): Promise<void> {
  await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.dialog-panel')!;
    const dialog = document.querySelector<HTMLElement>('dialog')!;
    const alphaOf = (color: string): number => {
      const alpha = color.includes('/')
        ? color.split('/')[1]
        : color.startsWith('rgba')
          ? color.split(',').at(-1)
          : undefined;
      return alpha === undefined ? (color === 'transparent' ? 0 : 1) : parseFloat(alpha);
    };
    const blurOf = (filter: string): number =>
      parseFloat(filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? '0');
    const downOf = (translate: unknown): number => {
      const parts = String(translate ?? 'none')
        .trim()
        .split(/\s+/);
      return parts.length > 1 ? parseFloat(parts[1]) : 0;
    };
    const record: SheetLeave = {
      slideFrom: null,
      slideTo: null,
      slideDuration: 0,
      slideEndedAt: null,
      veilAtEnd: null,
      blurAtEnd: null,
      removedAt: null,
    };
    (window as unknown as { sheetLeave: SheetLeave }).sheetLeave = record;
    panel.addEventListener('transitionrun', (event) => {
      if (event.target !== panel || event.propertyName !== 'translate') {
        return;
      }
      const slide = panel
        .getAnimations()
        .find((animation) => (animation as CSSTransition).transitionProperty === 'translate');
      const keyframes = (slide?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
      record.slideFrom = downOf(keyframes[0]?.['translate']);
      record.slideTo = String(keyframes.at(-1)?.['translate'] ?? '');
      record.slideDuration = Number(slide?.effect?.getTiming().duration ?? 0);
    });
    panel.addEventListener('transitionend', (event) => {
      if (event.target !== panel || event.propertyName !== 'translate') {
        return;
      }
      record.slideEndedAt = performance.now();
      const style = getComputedStyle(dialog);
      record.veilAtEnd = alphaOf(style.backgroundColor);
      record.blurAtEnd = blurOf(
        style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
      );
    });
    new MutationObserver((_, observer) => {
      if (!dialog.isConnected) {
        record.removedAt = performance.now();
        observer.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

function sheetLeave(page: Page): Promise<SheetLeave> {
  return page.evaluate(() => (window as unknown as { sheetLeave: SheetLeave }).sheetLeave);
}

function expectSlidOffTheScreen(leave: SheetLeave, from: number): void {
  expect(Math.abs(leave.slideFrom! - from)).toBeLessThan(2);
  expect(leave.slideTo).toMatch(/ 100%$/);
  expect(leave.slideDuration).toBeGreaterThanOrEqual(100);
  expect(leave.slideEndedAt).not.toBeNull();
  expect(leave.removedAt!).toBeGreaterThanOrEqual(leave.slideEndedAt!);
  expect(leave.veilAtEnd!).toBeLessThan(0.05);
  expect(leave.blurAtEnd!).toBeLessThan(0.5);
}

async function phoneThatAnimates(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function pageUsableAgain(page: Page): Promise<void> {
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.locator('[inert]').count()).toBe(0);
  await openPairing(page);
}

async function openPairing(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^(Přiřadit dárci|Nováková Jana .*)$/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Given an administrator with the pairing dialog of a payment open', () => {
  let pairing: Route[];

  test.beforeEach(async ({ page }) => {
    pairing = [];
    let pairedNow = false;
    await countDialogEntries(page);
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === PAYMENTS,
      (route) =>
        route.fulfill({
          json: { year: null, availableYears: [], items: pairedNow ? [] : [unpaired] },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donations/donors',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                donorId: administrator.id,
                name: 'Jana Nováková',
                type: 'PERSON',
                variableSymbol: '4821937560',
                companyIdentifier: null,
              },
            ],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donors',
      (route) => route.fulfill({ json: { items: [], hasMore: false } }),
    );
    await page.route(
      (url) => url.pathname === `${PAYMENTS}/${PAYMENT_ID}/pair`,
      (route) => {
        pairedNow = true;
        pairing.push(route);
      },
    );
    await openPayments(page);
    await openPairing(page);
  });

  test('when they go back, then the dialog closes and the payments stay on screen', async ({
    page,
  }) => {
    await stepBack(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await expect(page.locator('[data-payment-row]')).toContainText('Nováková Jana');
  });

  test('when they close it with its button and go back, then the page before the payments opens', async ({
    page,
  }) => {
    await page.getByRole('dialog').getByLabel('Zavřít').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await entryTakenBack(page);

    await stepBack(page);

    await expect(page).toHaveURL(/\/sprava$/);
  });

  test('when they go back while the pairing is being saved, then the dialog stays until it is done and a step back then leaves the payments', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox').fill('nov');
    await dialog.getByRole('radio', { name: /Jana Nováková/ }).check();
    await dialog.getByRole('button', { name: 'Přiřadit dárci Jana Nováková' }).click();
    await expect.poll(() => pairing.length).toBe(1);
    const entries = await dialogEntries(page);

    await stepBack(page);

    await expect.poll(() => dialogEntries(page)).toBe(entries + 1);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await pairing[0].fulfill({ json: { donationId: 'd1', changedYearlyReceipts: [] } });
    await expect(dialog).toHaveCount(0);
    await entryTakenBack(page);
    await stepBack(page);
    await expect(page).toHaveURL(/\/sprava$/);
  });

  test('when someone else changed the payment meanwhile, then the pairing dialog gives way to the sheet that says so and a step back closes only the sheet', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox').fill('nov');
    await dialog.getByRole('radio', { name: /Jana Nováková/ }).check();
    await dialog.getByRole('button', { name: 'Přiřadit dárci Jana Nováková' }).click();
    await expect.poll(() => pairing.length).toBe(1);
    await pairing[0].fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: {
        type: 'https://nfnn.cz/problems/donations/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        detail: 'Platbu mezitím změnil někdo jiný.',
        status: 409,
        version: '1b2c3d4e5f607182',
        current: { id: PAYMENT_ID },
      },
    });
    const sheet = page.getByRole('dialog', { name: 'Mezitím se to změnilo' });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => (history.state as Record<string, unknown>)['nfnnDialogDepth']),
      )
      .toBe(1);
    await expect.poll(() => dialogEntries(page)).toBe(2);

    await stepBack(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await entryTakenBack(page);
    await stepBack(page);
    await expect(page).toHaveURL(/\/sprava$/);
  });

  test('when they drag the sheet down by its top edge on a phone, then it follows the finger, closes and takes its entry back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = page.locator('.dialog-panel');
    const grabber = page.locator('.dialog-grabber');
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
    const opened = (await panel.boundingBox())!.y;
    const box = (await grabber.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 60, { steps: 4 });
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(opened + 40);
    await page.mouse.move(x, y + 400, { steps: 20 });
    await page.mouse.up();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await entryTakenBack(page);
    await stepBack(page);
    await expect(page).toHaveURL(/\/sprava$/);
  });

  test('when they drag the sheet only a little and rest before letting go, then it returns and a step back still closes it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = page.locator('.dialog-panel');
    const grabber = page.locator('.dialog-grabber');
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
    const opened = (await panel.boundingBox())!.y;
    const box = (await grabber.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 10 });
    await restLongerThanAFlick(page);
    await page.mouse.up();

    await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(opened, 0);
    await expect(page.getByRole('dialog')).toBeVisible();
    await stepBack(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
  });

  test('when a finger pulls the content of the sheet down from its top on a phone, then the sheet follows it, slides away and takes its entry back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = page.locator('.dialog-panel');
    const content = page.getByRole('dialog').getByRole('heading', { level: 2 }).first();
    await sheetSettled(page);
    const opened = (await panel.boundingBox())!.y;
    const box = (await content.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await fingerTo(content, 'touchstart', x, y);
    await fingerTo(content, 'touchmove', x, y + 20);
    await fingerTo(content, 'touchmove', x, y + 80);
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(opened + 60);
    await fingerTo(content, 'touchmove', x, y + 400);
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(opened + 300);
    await fingerTo(content, 'touchend', x, y + 400, false);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await entryTakenBack(page);
    await stepBack(page);
    await expect(page).toHaveURL(/\/sprava$/);
  });

  test('when a finger pulls the content of the sheet only a little on a phone, then it returns and a step back still closes it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = page.locator('.dialog-panel');
    const content = page.getByRole('dialog').getByRole('heading', { level: 2 }).first();
    await sheetSettled(page);
    const opened = (await panel.boundingBox())!.y;
    const box = (await content.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await fingerTo(content, 'touchstart', x, y);
    await fingerTo(content, 'touchmove', x, y + 20);
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(opened + 10);
    await fingerTo(content, 'touchend', x, y + 20, false);

    await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(opened, 0);
    await expect(page.getByRole('dialog')).toBeVisible();
    await stepBack(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
  });

  test('when they close the sheet with its button on a phone, then it slides down off the screen with its veil before it goes, and the page can be used again', async ({
    page,
  }) => {
    await phoneThatAnimates(page);
    await sheetSettled(page);
    await watchSheetLeave(page);

    await page.getByRole('dialog').getByLabel('Zavřít').click();

    await expect.poll(async () => (await sheetLeave(page)).removedAt).not.toBeNull();
    expectSlidOffTheScreen(await sheetLeave(page), 0);
    await entryTakenBack(page);
    await pageUsableAgain(page);
  });

  test('when a finger pulls the sheet far enough down on a phone and lets go, then it slides on from where the finger left it off the screen', async ({
    page,
  }) => {
    await phoneThatAnimates(page);
    const panel = page.locator('.dialog-panel');
    const content = page.getByRole('dialog').getByRole('heading', { level: 2 }).first();
    await sheetSettled(page);
    const opened = (await panel.boundingBox())!.y;
    const box = (await content.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await fingerTo(content, 'touchstart', x, y);
    await fingerTo(content, 'touchmove', x, y + 20);
    await fingerTo(content, 'touchmove', x, y + 200);
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(opened + 150);
    const released = (await panel.boundingBox())!.y;
    await watchSheetLeave(page);

    await fingerTo(content, 'touchend', x, y + 200, false);

    await expect.poll(async () => (await sheetLeave(page)).removedAt).not.toBeNull();
    expectSlidOffTheScreen(await sheetLeave(page), released - opened);
    await entryTakenBack(page);
    await pageUsableAgain(page);
  });

  test('when they go back with the sheet open on a phone, then it slides down off the screen and takes no new entry', async ({
    page,
  }) => {
    await phoneThatAnimates(page);
    await sheetSettled(page);
    const entries = await dialogEntries(page);
    await watchSheetLeave(page);

    await stepBack(page);

    await expect.poll(async () => (await sheetLeave(page)).removedAt).not.toBeNull();
    expectSlidOffTheScreen(await sheetLeave(page), 0);
    expect(await dialogEntries(page)).toBe(entries);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await entryTakenBack(page);
    await pageUsableAgain(page);
  });

  test('when they press the close button twice and go back while the sheet slides away, then it closes once and the page before the payments is one step back', async ({
    page,
  }) => {
    await phoneThatAnimates(page);
    await sheetSettled(page);

    await page.evaluate(() => {
      const close = document.querySelector<HTMLButtonElement>('dialog .dialog-close')!;
      close.click();
      close.click();
      history.back();
    });

    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await entryTakenBack(page);
    expect(await page.locator('[inert]').count()).toBe(0);
    await stepBack(page);
    await expect(page).toHaveURL(/\/sprava$/);
  });

  test('when the visitor asks for less motion and closes the sheet on a phone, then it goes at once', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sheetSettled(page);
    await watchSheetLeave(page);

    await page.getByRole('dialog').getByLabel('Zavřít').click();

    await expect.poll(async () => (await sheetLeave(page)).removedAt).not.toBeNull();
    expect((await sheetLeave(page)).slideFrom).toBeNull();
    await pageUsableAgain(page);
  });

  test('when they reload the page with the dialog open, then one step back leaves the payments', async ({
    page,
  }) => {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as Probe).pops)).toBe(1);
    await entryTakenBack(page);

    await stepBack(page);

    await expect(page).toHaveURL(/\/sprava$/);
  });

  test('when they close it, ask for a step forward and open it once more, then nothing comes forward and a step back still closes it', async ({
    page,
  }) => {
    await page.getByRole('dialog').getByLabel('Zavřít').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await entryTakenBack(page);
    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await entryTakenBack(page);
    await openPairing(page);

    await stepBack(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await stepBack(page);
    await expect(page).toHaveURL(/\/sprava$/);
  });

  test('when they have moved through three pages and opened the dialog, then the browser holds one entry of the site and its Back leaves the site', async ({
    page,
  }) => {
    expect(await browserEntries(page)).toBe(2);

    await page.goBack();

    await expect(page).toHaveURL('about:blank');
  });
});
