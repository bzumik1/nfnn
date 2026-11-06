import { Locator, Page } from '@playwright/test';
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
      await expect(dialog.getByText('Vyplňte prosím e-mail.')).toHaveCount(0);
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

  test('when the visitor taps Jiná částka, then the amount field takes the focus in the same tap', async ({
    page,
  }) => {
    await page.goto('/prispet');

    await page.getByRole('button', { name: 'Jiná částka' }).tap();

    await expect(page.locator('#donate-custom-amount')).toBeFocused();
  });
});
