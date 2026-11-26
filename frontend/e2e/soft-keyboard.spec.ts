import { Locator, Page } from '@playwright/test';
import { administrator, adminSettings, mockDonorApi, session } from './donor-session';
import { expect, test } from './fixtures';
import { requestsInFlight, settled } from './settled';

const SMALL_PHONE = { width: 375, height: 667 };
const KEYBOARD_HEIGHT = 262;

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

  test('when the visitor taps Jiná částka, then the amount field takes the focus in the same tap', async ({
    page,
  }) => {
    await page.goto('/prispet');

    await page.getByRole('radio', { name: 'Jiná částka' }).tap();

    await expect(page.locator('#donate-custom-amount')).toBeFocused();
  });
});
