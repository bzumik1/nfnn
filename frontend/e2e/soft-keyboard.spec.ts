import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { requestsInFlight, settled } from './settled';
import {
  chunkLoadNotice,
  openAboutThenLoseNewChunks,
  openPolicyFromContact,
  withoutSessionStorage,
} from './lost-chunks';

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

type Hit = 'field' | 'notice' | 'other';

function hitOnFieldCentre(page: Page): Promise<Hit> {
  return page.evaluate(() => {
    const field = document.querySelector('#contact-name')!;
    const box = field.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (hit === field) {
      return 'field';
    }
    return hit?.closest('.ui-notice--floating') ? 'notice' : 'other';
  });
}

function hitOnNoticeCentre(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const notice = document.querySelector('.ui-notice--floating')!;
    const box = notice.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && notice.contains(hit);
  });
}

function scrollFieldUnderNotice(page: Page): Promise<void> {
  return page.evaluate(() => {
    const field = document.querySelector('#contact-name')!.getBoundingClientRect();
    const notice = document.querySelector('.ui-notice--floating')!.getBoundingClientRect();
    window.scrollBy({
      top: field.top + field.height / 2 - (notice.top + notice.height / 2),
      behavior: 'instant',
    });
  });
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

  test('when the visitor taps Jiná částka, then the amount field takes the focus in the same tap', async ({
    page,
  }) => {
    await page.goto('/prispet');

    await page.getByRole('radio', { name: 'Jiná částka' }).tap();

    await expect(page.locator('#donate-custom-amount')).toBeFocused();
  });

  test.describe('when a floating notice shows over the field the visitor types into', () => {
    test.beforeEach(async ({ page }) => {
      await withoutSessionStorage(page);
      await openAboutThenLoseNewChunks(page);
      await openPolicyFromContact(page);
      await expect(chunkLoadNotice(page)).toBeVisible();
      await expect(
        chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' }),
      ).toBeFocused();
      await page.locator('#contact-name').focus();
      await expect(page.locator('#contact-name')).toBeFocused();
      await expect
        .poll(async () => {
          await scrollFieldUnderNotice(page);
          return hitOnFieldCentre(page);
        })
        .toBe('notice');
    });

    test('and the keyboard comes up, then the notice steps aside for the field without moving the page, is still heard, and comes back when the keyboard goes down', async ({
      page,
    }) => {
      const scrollTop = await page.evaluate(() => window.scrollY);

      await showKeyboard(page);

      await expect(page.getByRole('navigation', { name: 'Hlavní sekce' })).toBeHidden();
      await expect(page.locator('#contact-name')).toBeFocused();
      await expect.poll(() => hitOnFieldCentre(page)).toBe('field');
      expect(await scrollTopAfterTwoFrames(page)).toBe(scrollTop);
      expect(await chunkLoadNotice(page).ariaSnapshot()).toContain('Načíst znovu');

      await hideKeyboard(page);

      await expect.poll(() => hitOnNoticeCentre(page)).toBe(true);
      expect(await scrollTopAfterTwoFrames(page)).toBe(scrollTop);
    });

    test('and the visitor drags the page while typing, then the page stays where the drag left it', async ({
      page,
    }) => {
      await showKeyboard(page);
      await expect(page.getByRole('navigation', { name: 'Hlavní sekce' })).toBeHidden();
      await expect(page.locator('#contact-name')).toBeFocused();
      await expect.poll(() => hitOnFieldCentre(page)).toBe('field');

      const dragged = await page.evaluate(() => {
        window.scrollBy({ top: -40, behavior: 'instant' });
        window.visualViewport?.dispatchEvent(new Event('scroll'));
        return window.scrollY;
      });

      expect(await scrollTopAfterTwoFrames(page)).toBe(dragged);
      expect(await hitOnFieldCentre(page)).toBe('field');
    });
  });
});
