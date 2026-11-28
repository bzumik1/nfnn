import { Locator, Page } from '@playwright/test';
import {
  administrator,
  adminSettings,
  mockDonorApi,
  openDonorSection,
  rememberedDonorSession,
  secondFactorEnrolment,
  session,
} from './donor-session';
import { expect, test } from './fixtures';
import {
  chunkLoadNotice,
  openAboutThenLoseNewChunks,
  openPolicyFromContact,
  withoutSessionStorage,
} from './lost-chunks';
import { requestsInFlight, settled } from './settled';

const SMALL_PHONE = { width: 375, height: 667 };
const KEYBOARD_HEIGHT = 262;
const TABLET = { width: 1180, height: 820 };

interface StandInKeyboard {
  show(height: number): void;
  hide(): void;
}

type KeyboardWindow = Window & { standInKeyboard?: StandInKeyboard };

async function standInForTheKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let covered = 0;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => window.innerHeight - covered },
      width: { get: () => window.innerWidth },
      offsetTop: { value: 0 },
      offsetLeft: { value: 0 },
      pageTop: { get: () => window.scrollY },
      pageLeft: { get: () => window.scrollX },
      scale: { value: 1 },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => viewport });
    const resized = (height: number) => {
      covered = height;
      viewport.dispatchEvent(new Event('resize'));
    };
    (window as KeyboardWindow).standInKeyboard = {
      show: (height) => resized(height),
      hide: () => resized(0),
    };
  });
}

async function showKeyboard(page: Page): Promise<void> {
  await page.evaluate(
    (height) => (window as KeyboardWindow).standInKeyboard?.show(height),
    KEYBOARD_HEIGHT,
  );
}

async function hideKeyboard(page: Page): Promise<void> {
  await page.evaluate(() => (window as KeyboardWindow).standInKeyboard?.hide());
}

async function hideKeyboardAsDoneDoes(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await hideKeyboard(page);
}

function placeProblems(target: Locator, keyboard: number): Promise<string[]> {
  return target.evaluate((element, covered) => {
    const shown = element.closest('app-form-field') ?? element;
    const box = shown.getBoundingClientRect();
    const dialog = element.closest('dialog');
    let top = 0;
    let bottom = window.innerHeight - covered;
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') {
        const scrollerTop = parent.getBoundingClientRect().top + parent.clientTop;
        top = Math.max(top, scrollerTop);
        bottom = Math.min(bottom, scrollerTop + parent.clientHeight);
      }
    }
    if (shown !== element) {
      for (const actions of dialog?.querySelectorAll('.ui-dialog__actions') ?? []) {
        if (getComputedStyle(actions).position === 'sticky') {
          bottom = Math.min(bottom, actions.getBoundingClientRect().top);
        }
      }
    }
    const problems: string[] = [];
    if (box.top < top - 1) {
      problems.push(`cut ${Math.round(top - box.top)} px at the top`);
    }
    if (box.bottom > bottom + 1) {
      problems.push(`hidden ${Math.round(box.bottom - bottom)} px at the bottom`);
    }
    return problems;
  }, keyboard);
}

async function expectAboveKeyboard(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(SMALL_PHONE.height - KEYBOARD_HEIGHT);
}

const FLOATING_NOTICE = '.ui-notice--floating';
const OFFLINE_PILL = '.offline-pill';

type Hit = 'field' | 'cover' | 'other';

function hitOnFieldCentre(field: Locator, cover = FLOATING_NOTICE): Promise<Hit> {
  return field.evaluate((element, coverSelector) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (hit === element) {
      return 'field';
    }
    return hit?.closest(coverSelector) ? 'cover' : 'other';
  }, cover);
}

function hitOnCoverCentre(page: Page, cover = FLOATING_NOTICE): Promise<boolean> {
  return page.evaluate((coverSelector) => {
    const covering = document.querySelector(coverSelector)!;
    const box = covering.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && covering.contains(hit);
  }, cover);
}

function scrollFieldUnder(field: Locator, cover = FLOATING_NOTICE): Promise<void> {
  return field.evaluate((element, coverSelector) => {
    const box = element.getBoundingClientRect();
    const covering = document.querySelector(coverSelector)!.getBoundingClientRect();
    window.scrollBy({
      top: box.top + box.height / 2 - (covering.top + covering.height / 2),
      behavior: 'instant',
    });
  }, cover);
}

function scrollTopAfterTwoFrames(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY))),
      ),
  );
}

test.describe('Given a small phone whose on-screen keyboard covers the lower part of the screen', () => {
  test.use({ viewport: SMALL_PHONE, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await standInForTheKeyboard(page);
  });

  test.describe('when the visitor signs in from the donate page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/prispet');
      await page.getByRole('main').getByRole('button', { name: 'Přihlásit se' }).click();
      await expect(page.locator('#login-dialog-title')).toBeFocused();
      await page.locator('#login-email').tap();
      await expect(page.locator('#login-email')).toBeFocused();
    });

    test('and taps the password with the e-mail still empty, then the password and the sign-in button stay above the keyboard and the e-mail says nothing yet', async ({
      page,
    }) => {
      const dialog = page.getByRole('dialog');
      const inFlight = requestsInFlight(page);
      await page.locator('#login-password').tap();
      await showKeyboard(page);
      await settled(page, inFlight, 5_000);

      await expectAboveKeyboard(page.locator('#login-password'));
      await expectAboveKeyboard(dialog.getByRole('button', { name: 'Přihlásit se', exact: true }));
      await expect(dialog.getByText('Vyplňte prosím e\u2011mail.')).toHaveCount(0);
    });

    test('and presses the Next key under the e-mail, then the password takes the focus and the form is not sent yet', async ({
      page,
    }) => {
      await showKeyboard(page);
      await page.locator('#login-email').fill('jana@example.cz');

      const inFlight = requestsInFlight(page);

      await page.locator('#login-email').press('Enter');
      await settled(page, inFlight, 5_000);

      await expect(page.locator('#login-password')).toBeFocused();
      await expect(page.getByRole('dialog').getByText('Vyplňte prosím heslo.')).toHaveCount(0);
    });
  });

  test('when a field of the contact form takes the keyboard, then the tab bar steps aside until the keyboard goes down', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    const tabs = page.getByRole('navigation', { name: 'Hlavní sekce' });
    await page.locator('#contact-name').focus();

    await showKeyboard(page);
    await expect(tabs).toBeHidden();

    await hideKeyboard(page);
    await expect(tabs).toBeVisible();
  });

  test('when the visitor sends the empty registration form with its button and the keyboard rises for the first field, then the field with its error stands above the keyboard, and once the keyboard goes the close button shows again', async ({
    page,
  }) => {
    await page.goto('/prispet');
    await page.getByRole('main').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Registrace', exact: true }).tap();
    await dialog.getByRole('button', { name: 'Vytvořit účet' }).tap();
    const name = dialog.getByLabel('Jméno a příjmení');
    await expect(name).toBeFocused();

    await showKeyboard(page);

    await expect.poll(() => placeProblems(name, KEYBOARD_HEIGHT)).toEqual([]);

    await hideKeyboardAsDoneDoes(page);

    await expect
      .poll(() => placeProblems(dialog.getByRole('button', { name: 'Zavřít' }), 0))
      .toEqual([]);
    await expect.poll(() => placeProblems(name, 0)).toEqual([]);
  });

  test('when an administrator taps Zneplatnit klíč with the code still empty and the keyboard up, which keeps the focus in the field as iOS does, then the code field with its error and hint stands above the sticky buttons and the keyboard, and still above the buttons once the keyboard goes', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    const code = dialog.getByLabel('Kód z aplikace');
    await code.tap();
    await showKeyboard(page);

    await dialog
      .getByRole('button', { name: 'Zneplatnit klíč', exact: true })
      .dispatchEvent('click');

    await expect(code).toBeFocused();
    await expect(dialog.getByText('Opište prosím kód z aplikace.')).toBeVisible();
    await expect.poll(() => placeProblems(code, KEYBOARD_HEIGHT)).toEqual([]);

    await hideKeyboardAsDoneDoes(page);

    await expect.poll(() => placeProblems(code, 0)).toEqual([]);
  });

  test('when an administrator taps Zneplatnit klíč with the code still empty and the keyboard dips and rises again while the field gets the focus back, as on an iPhone, then the code field with its error and hint stands above the sticky buttons and the keyboard', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    const code = dialog.getByLabel('Kód z aplikace');
    await code.tap();
    await showKeyboard(page);

    await dialog
      .getByRole('button', { name: 'Zneplatnit klíč', exact: true })
      .dispatchEvent('click');
    await expect(dialog.getByText('Opište prosím kód z aplikace.')).toBeVisible();
    await hideKeyboard(page);
    await showKeyboard(page);

    await expect(code).toBeFocused();
    await expect.poll(() => placeProblems(code, KEYBOARD_HEIGHT)).toEqual([]);

    await hideKeyboardAsDoneDoes(page);

    await expect.poll(() => placeProblems(code, 0)).toEqual([]);
  });

  test('when an administrator types the code in Zneplatnit klíč and the field loses the focus while the keyboard is still up, then the sheet keeps its head inside the short dialog', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    const code = dialog.getByLabel('Kód z aplikace');
    await code.tap();
    await showKeyboard(page);
    await expect(page.locator('html')).toHaveClass(/keyboard-open/);

    await code.evaluate((field) => field.blur());

    await expect(page.locator('html')).not.toHaveClass(/keyboard-open/);
    await expect.poll(() => panelAboveItsDialog(dialog)).toBe(0);
  });

  test('when a hardware keyboard’s bar shortens the view under the sign-in sheet without counting as a keyboard, then the strip under the sheet shows the surface, not the bare page', async ({
    page,
  }) => {
    await page.goto('/prispet');
    await page.getByRole('main').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await page.locator('#login-email').tap();

    await page.evaluate(() => (window as KeyboardWindow).standInKeyboard?.show(60));

    await expect(page.locator('html')).not.toHaveClass(/keyboard-open/);
    await expect.poll(() => backdropAgainstSurface(dialog)).toEqual({ same: true });
  });

  test('when the field of Zneplatnit klíč loses the focus while the keyboard is still up, then the sheet keeps the top gap the theme asks for, with no jump', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--sheet-top-gap', `${100}px`),
    );
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    const code = dialog.getByLabel('Kód z aplikace');
    await code.tap();
    await showKeyboard(page);
    await expect.poll(() => panelBelowItsDialogTop(dialog)).toBeGreaterThanOrEqual(100);

    await code.evaluate((field) => field.blur());

    await expect(page.locator('html')).not.toHaveClass(/keyboard-open/);
    await expect.poll(() => panelBelowItsDialogTop(dialog)).toBeGreaterThanOrEqual(100);
  });

  test('when the view reports a stale height taller than the window, as after a rotation, then the sign-in sheet stays within the window', async ({
    page,
  }) => {
    await page.goto('/prispet');
    await page.getByRole('main').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.evaluate(() => (window as KeyboardWindow).standInKeyboard?.show(-233));

    await expect.poll(() => dialogBox(dialog)).toEqual({ top: 0, height: SMALL_PHONE.height });
  });

  test('when the visitor is offline and types into a field of the contact form under the Offline pill, then the pill steps aside for the field without moving the page, is still heard, and comes back when the keyboard goes down', async ({
    page,
    context,
  }) => {
    await page.goto('/o-nas');
    const field = page.locator('#contact-name');
    const pill = page.locator(OFFLINE_PILL);
    await expect(field).toBeVisible();
    await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
    await context.setOffline(true);
    await expect(pill).toBeVisible({ timeout: 10_000 });
    await field.focus();
    await expect(field).toBeFocused();
    await expect
      .poll(async () => {
        await scrollFieldUnder(field, OFFLINE_PILL);
        return hitOnFieldCentre(field, OFFLINE_PILL);
      })
      .toBe('cover');
    const scrollTop = await page.evaluate(() => window.scrollY);

    await showKeyboard(page);

    await expect(page.locator('html')).toHaveClass(/(^|\s)keyboard-open(\s|$)/);
    await expect(field).toBeFocused();
    await expect.poll(() => hitOnFieldCentre(field, OFFLINE_PILL)).toBe('field');
    expect(await scrollTopAfterTwoFrames(page)).toBe(scrollTop);
    expect(await pill.ariaSnapshot()).toContain('Offline');

    await hideKeyboard(page);

    await expect.poll(() => hitOnCoverCentre(page, OFFLINE_PILL)).toBe(true);
    expect(await scrollTopAfterTwoFrames(page)).toBe(scrollTop);
  });

  test('when the keyboard is up under the sign-in sheet and the phone paints no backdrop under the keyboard, as iOS does, then the part of the screen under the sheet shows the surface, not the page', async ({
    page,
  }) => {
    await page.goto('/prispet');
    await page.getByRole('main').getByRole('button', { name: 'Přihlásit se' }).click();
    await page.locator('#login-email').tap();
    await showKeyboard(page);
    await expect(page.locator('html')).toHaveClass(/keyboard-open/);
    await page.addStyleTag({ content: 'dialog::backdrop { display: none !important; }' });

    await expect.poll(() => surfaceUnderTheSheet(page, KEYBOARD_HEIGHT / 2)).toBe(true);
  });

  test('when the visitor taps Jiná částka, then the amount field takes the focus in the same tap', async ({
    page,
  }) => {
    await page.goto('/prispet');

    await page.getByRole('radio', { name: 'Jiná částka' }).tap();

    await expect(page.locator('#donate-custom-amount')).toBeFocused();
  });
  test('when the chunk-load notice shows and the visitor types into a field of the contact form, then the field keeps the focus once the keyboard is up and takes what is typed', async ({
    page,
  }) => {
    await withoutSessionStorage(page);
    await openAboutThenLoseNewChunks(page);
    await openPolicyFromContact(page);
    await expect(chunkLoadNotice(page)).toBeVisible();
    await expect(chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' })).toBeFocused();
    const field = page.locator('#contact-name');
    await field.focus();
    await expect(field).toBeFocused();

    await showKeyboard(page);
    await expect(page.getByRole('navigation', { name: 'Hlavní sekce' })).toBeHidden();
    await page.keyboard.type('Jana');

    await expect(field).toBeFocused();
    await expect(field).toHaveValue('Jana');
  });
});

interface PannedViewport {
  pan(offsetTop: number, height: number, layoutHeight: number): void;
  rest(): void;
}

type PannedWindow = Window & { pannedViewport?: PannedViewport };

const PANNED = { offsetTop: 303, height: 364, layoutHeight: 667 };

async function standInForAPanningKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const realInnerHeight =
      Object.getOwnPropertyDescriptor(window, 'innerHeight') ??
      Object.getOwnPropertyDescriptor(Window.prototype, 'innerHeight');
    const measuredInnerHeight = () => realInnerHeight?.get?.call(window) as number;
    let panned: { offsetTop: number; height: number; layoutHeight: number } | null = null;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => panned?.height ?? measuredInnerHeight() },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => panned?.offsetTop ?? 0 },
      offsetLeft: { value: 0 },
      pageTop: { get: () => window.scrollY },
      pageLeft: { get: () => window.scrollX },
      scale: { value: 1 },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => viewport });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      get: () => panned?.layoutHeight ?? measuredInnerHeight(),
    });
    (window as PannedWindow).pannedViewport = {
      pan: (offsetTop, height, layoutHeight) => {
        panned = { offsetTop, height, layoutHeight };
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      },
      rest: () => {
        panned = null;
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      },
    };
  });
}

function panelBelowItsDialogTop(dialog: Locator): Promise<number> {
  return dialog.evaluate((element) => {
    const panel = element.querySelector('.dialog-panel')!.getBoundingClientRect();
    return Math.round(panel.top - element.getBoundingClientRect().top);
  });
}

function backdropAgainstSurface(dialog: Locator): Promise<{ same: boolean }> {
  return dialog.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.background = 'var(--color-surface)';
    document.body.append(probe);
    const surface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { same: getComputedStyle(element, '::backdrop').backgroundColor === surface };
  });
}

function panelAboveItsDialog(dialog: Locator): Promise<number> {
  return dialog.evaluate((element) => {
    const panel = element.querySelector('.dialog-panel')!.getBoundingClientRect();
    return Math.max(0, Math.round(element.getBoundingClientRect().top - panel.top));
  });
}

function dialogBox(dialog: Locator): Promise<{ top: number; height: number }> {
  return dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), height: Math.round(box.height) };
  });
}

const KEYBOARD_OVER_THE_HEAD = 400;
const SHEET_TOP_GAP = 48;
const SCROLL_LEFT_AT_FULL_HEIGHT = 30;

function afterTwoFrames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

function sheetMeasures(
  dialog: Locator,
): Promise<{ content: number; fieldEnd: number; buttons: number }> {
  return dialog.evaluate((element) => {
    const panel = element.querySelector<HTMLElement>('.dialog-panel')!;
    const field = element.querySelector('#withdrawal-code')!.closest('app-form-field')!;
    const panelTop = panel.getBoundingClientRect().top + panel.clientTop;
    return {
      content: panel.scrollHeight,
      fieldEnd: Math.ceil(field.getBoundingClientRect().bottom - panelTop + panel.scrollTop),
      buttons: Math.ceil(
        element.querySelector('.ui-dialog__actions')!.getBoundingClientRect().height,
      ),
    };
  });
}

function panelScrollTop(dialog: Locator): Promise<number> {
  return dialog.evaluate((element) => element.querySelector('.dialog-panel')!.scrollTop);
}

async function surfaceUnderTheSheet(page: Page, depthBelowTheSheet: number): Promise<boolean> {
  const shot = await page.screenshot({ animations: 'disabled' });
  return page.evaluate(
    async ({ base64, depth }) => {
      const dialog = document.querySelector('dialog[open]')!;
      const probe = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })!;
      probe.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-surface')
        .trim();
      probe.fillRect(0, 0, 1, 1);
      const surface = [...probe.getImageData(0, 0, 1, 1).data];
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const image = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = image.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const scale = bitmap.width / window.innerWidth;
      const y = Math.floor((dialog.getBoundingClientRect().bottom + depth) * scale);
      const pixels = context.getImageData(0, y, bitmap.width, 1).data;
      for (let index = 0; index < pixels.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) {
          if (Math.abs(pixels[index + channel] - surface[channel]) > 2) {
            return false;
          }
        }
      }
      return true;
    },
    { base64: shot.toString('base64'), depth: depthBelowTheSheet },
  );
}

function fieldOutsideItsSheet(code: Locator): Promise<string[]> {
  return code.evaluate((element) => {
    const field = element.closest('app-form-field')!.getBoundingClientRect();
    const dialog = element.closest('dialog')!;
    const panel = dialog.querySelector('.dialog-panel')!;
    const panelTop = panel.getBoundingClientRect().top + panel.clientTop;
    const top = Math.round(Math.max(dialog.getBoundingClientRect().top, panelTop));
    let bottom = Math.min(dialog.getBoundingClientRect().bottom, panelTop + panel.clientHeight);
    for (const actions of dialog.querySelectorAll('.ui-dialog__actions')) {
      bottom = Math.min(bottom, actions.getBoundingClientRect().top);
    }
    bottom = Math.round(bottom);
    const problems: string[] = [];
    if (field.top < top - 1) {
      problems.push(`field ${Math.round(field.top)}–${Math.round(field.bottom)} above ${top}`);
    }
    if (field.bottom > bottom + 1) {
      problems.push(`field ${Math.round(field.top)}–${Math.round(field.bottom)} below ${bottom}`);
    }
    return problems;
  });
}

function fieldOutsideTheShownPanel(code: Locator): Promise<string[]> {
  return code.evaluate((element) => {
    const field = element.closest('app-form-field')!.getBoundingClientRect();
    const dialog = element.closest('dialog')!;
    const panel = dialog.querySelector('.dialog-panel')!;
    const viewport = window.visualViewport!;
    const panelTop = panel.getBoundingClientRect().top + panel.clientTop;
    let top = Math.max(viewport.offsetTop, panelTop);
    let bottom = Math.min(viewport.offsetTop + viewport.height, panelTop + panel.clientHeight);
    for (const actions of dialog.querySelectorAll('.ui-dialog__actions')) {
      bottom = Math.min(bottom, actions.getBoundingClientRect().top);
    }
    top = Math.round(top);
    bottom = Math.round(bottom);
    const problems: string[] = [];
    if (field.top < top - 1) {
      problems.push(`field ${Math.round(field.top)}–${Math.round(field.bottom)} above ${top}`);
    }
    if (field.bottom > bottom + 1) {
      problems.push(`field ${Math.round(field.top)}–${Math.round(field.bottom)} below ${bottom}`);
    }
    return problems;
  });
}

test.describe('Given a phone 390 pt wide, as tall as Zneplatnit klíč needs to show its head and its code field together once the keyboard is gone, but shorter than the whole sheet, as the 17e is', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await standInForTheKeyboard(page);
  });

  test('when an administrator sends the empty code with the keyboard up and then taps Done, which blurs the field while the view is still short and grows it only later, then the sheet comes back to its start with its title and close button', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    const code = dialog.getByLabel('Kód z aplikace');
    await code.tap();
    await page.evaluate(
      (height) => (window as KeyboardWindow).standInKeyboard?.show(height),
      KEYBOARD_OVER_THE_HEAD,
    );
    await dialog
      .getByRole('button', { name: 'Zneplatnit klíč', exact: true })
      .dispatchEvent('click');
    await expect(dialog.getByText('Opište prosím kód z aplikace.')).toBeVisible();
    await expect.poll(() => panelScrollTop(dialog)).toBeGreaterThan(0);
    const sheet = await sheetMeasures(dialog);
    const windowHeight = sheet.content + SHEET_TOP_GAP - SCROLL_LEFT_AT_FULL_HEIGHT;
    expect(sheet.fieldEnd + sheet.buttons).toBeLessThanOrEqual(windowHeight - SHEET_TOP_GAP);
    await page.setViewportSize({ width: 390, height: windowHeight });
    await page.evaluate(
      (height) => (window as KeyboardWindow).standInKeyboard?.show(height),
      KEYBOARD_OVER_THE_HEAD,
    );
    await expect(page.locator('html')).toHaveClass(/keyboard-open/);

    await code.evaluate((field) => field.blur());
    await expect(page.locator('html')).not.toHaveClass(/keyboard-open/);
    await afterTwoFrames(page);
    await hideKeyboard(page);

    await expect.poll(() => panelScrollTop(dialog)).toBe(0);
    await expect(dialog.getByRole('heading', { name: 'Zneplatnit klíč 21fe31df?' })).toBeInViewport(
      {
        ratio: 1,
      },
    );
    await expect(dialog.getByRole('button', { name: 'Zavřít' })).toBeInViewport({ ratio: 1 });
  });
});

test.describe('Given an iPhone SE whose keyboard pans the visual viewport under a fixed dialog, as the home-screen app does', () => {
  test.use({ viewport: SMALL_PHONE, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await standInForAPanningKeyboard(page);
  });

  test('when an administrator taps Zneplatnit klíč with the code still empty, then the sheet stands in the panned view and the code field with its error and hint stands above its sticky buttons', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    const code = dialog.getByLabel('Kód z aplikace');
    await code.tap();
    await page.setViewportSize({ width: SMALL_PHONE.width, height: PANNED.height });
    await page.evaluate(
      ({ offsetTop, height, layoutHeight }) =>
        (window as PannedWindow).pannedViewport?.pan(offsetTop, height, layoutHeight),
      PANNED,
    );

    await dialog
      .getByRole('button', { name: 'Zneplatnit klíč', exact: true })
      .dispatchEvent('click');

    await expect(code).toBeFocused();
    await expect(dialog.getByText('Opište prosím kód z aplikace.')).toBeAttached();
    await expect.poll(() => fieldOutsideTheShownPanel(code)).toEqual([]);
    expect(await dialogBox(dialog)).toEqual({ top: PANNED.offsetTop, height: PANNED.height });
    expect(await panelAboveItsDialog(dialog)).toBe(0);
  });

  test('when an administrator taps Zneplatnit klíč with the code still empty and the phone measures every box from the panned view, as iOS does, then the code field with its error and hint stands inside the sheet above its sticky buttons', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    const code = dialog.getByLabel('Kód z aplikace');
    await code.tap();
    await page.setViewportSize({ width: SMALL_PHONE.width, height: PANNED.height });
    await page.evaluate(
      ({ offsetTop, height, layoutHeight }) =>
        (window as PannedWindow).pannedViewport?.pan(offsetTop, height, layoutHeight),
      PANNED,
    );
    await expect
      .poll(() => dialogBox(dialog))
      .toEqual({
        top: PANNED.offsetTop,
        height: PANNED.height,
      });
    await dialog.evaluate((element) => element.style.setProperty('top', '0px', 'important'));

    await dialog
      .getByRole('button', { name: 'Zneplatnit klíč', exact: true })
      .dispatchEvent('click');

    await expect(code).toBeFocused();
    await expect(dialog.getByText('Opište prosím kód z aplikace.')).toBeAttached();
    await expect.poll(() => fieldOutsideItsSheet(code)).toEqual([]);
  });

  test('when the device reports the short layout itself and no keyboard is counted open, then the sheet still stands in the panned view with its head', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/nastaveni');
    await page.getByRole('button', { name: 'Zneplatnit klíč serveru…' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Zneplatnit klíč 21fe31df?' });
    await dialog.getByLabel('Kód z aplikace').tap();

    await page.setViewportSize({ width: SMALL_PHONE.width, height: PANNED.height });
    await page.evaluate(
      ({ offsetTop, height }) =>
        (window as PannedWindow).pannedViewport?.pan(offsetTop, height, height),
      PANNED,
    );

    await expect(page.locator('html')).not.toHaveClass(/keyboard-open/);
    await expect
      .poll(() => dialogBox(dialog))
      .toEqual({ top: PANNED.offsetTop, height: PANNED.height });
    expect(await panelAboveItsDialog(dialog)).toBe(0);
  });
});

test.describe('Given a tablet held sideways whose on-screen keyboard shortens the view under the sign-in sheet', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await standInForTheKeyboard(page);
  });

  test('when the visitor types into the e-mail, then the tall sheet stands at the top of the shortened dialog and ends inside it, so only the sheet scrolls', async ({
    page,
  }) => {
    await page.goto('/prispet');
    await page.getByRole('main').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await page.locator('#login-email').tap();

    await page.evaluate(() => (window as KeyboardWindow).standInKeyboard?.show(400));

    await expect(page.locator('html')).toHaveClass(/keyboard-open/);
    await expect
      .poll(() => tallPanelInItsDialog(dialog))
      .toEqual({ marginTop: '0px', pastTheBottom: 0, dialogScrolls: false });
  });
});

function tallPanelInItsDialog(
  dialog: Locator,
): Promise<{ marginTop: string; pastTheBottom: number; dialogScrolls: boolean }> {
  return dialog.evaluate((element) => {
    const panel = element.querySelector<HTMLElement>('.dialog-panel')!;
    return {
      marginTop: getComputedStyle(panel).marginTop,
      pastTheBottom: Math.max(
        0,
        Math.round(panel.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom),
      ),
      dialogScrolls: element.scrollHeight > element.clientHeight + 1,
    };
  });
}

test.describe('Given a tablet whose on-screen keyboard covers the lower part of the screen while the overview of gifts is being saved to the device', () => {
  test.use({ viewport: TABLET, hasTouch: true });

  const codeField = (page: Page) => page.getByLabel('Kód z aplikace');

  test.beforeEach(async ({ page }) => {
    await standInForTheKeyboard(page);
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donations/me/sync',
      () => new Promise<void>(() => undefined),
    );
    await page.route('**/api/donors/me/second-factor/setup', (route) =>
      route.fulfill({ json: secondFactorEnrolment }),
    );
    await rememberedDonorSession(page);
    await page.goto('/darce/prehled');
    await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Zapnout dvoufaktorové ověření' }).click();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.locator('.first-sync--saving')).toBeVisible();
    await codeField(page).focus();
    await expect(codeField(page)).toBeFocused();
    await expect
      .poll(async () => {
        await scrollFieldUnder(codeField(page));
        return hitOnFieldCentre(codeField(page));
      })
      .toBe('cover');
    await expect(codeField(page)).toBeFocused();
  });

  test('when the keyboard comes up for the code field under the notice, then the notice steps aside for the field without moving the page, is still heard, and comes back when the keyboard goes down', async ({
    page,
  }) => {
    const scrollTop = await page.evaluate(() => window.scrollY);

    await showKeyboard(page);

    await expect(page.locator('html')).toHaveClass(/(^|\s)keyboard-open(\s|$)/);
    await expect(codeField(page)).toBeFocused();
    await expect.poll(() => hitOnFieldCentre(codeField(page))).toBe('field');
    expect(await scrollTopAfterTwoFrames(page)).toBe(scrollTop);
    expect(await page.locator('.first-sync--saving').ariaSnapshot()).toContain(
      'Ukládáme přehled vašich darů',
    );

    await hideKeyboard(page);

    await expect.poll(() => hitOnCoverCentre(page)).toBe(true);
    expect(await scrollTopAfterTwoFrames(page)).toBe(scrollTop);
  });

  test('when the visitor drags the page while typing into the code field, then the page stays where the drag left it', async ({
    page,
  }) => {
    await showKeyboard(page);
    await expect(page.locator('html')).toHaveClass(/(^|\s)keyboard-open(\s|$)/);
    await expect(codeField(page)).toBeFocused();
    await expect.poll(() => hitOnFieldCentre(codeField(page))).toBe('field');

    const beforeDrag = await page.evaluate(() => window.scrollY);
    const dragged = await page.evaluate(() => {
      window.scrollBy({ top: 40, behavior: 'instant' });
      window.visualViewport?.dispatchEvent(new Event('scroll'));
      return window.scrollY;
    });

    expect(dragged).toBe(beforeDrag + 40);
    expect(await scrollTopAfterTwoFrames(page)).toBe(dragged);
    expect(await hitOnFieldCentre(codeField(page))).toBe('field');
  });
});
