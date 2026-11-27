import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { requestsInFlight, settled } from './settled';
import {
  mockDonorApi,
  openDonorSection,
  rememberedDonorSession,
  secondFactorEnrolment,
} from './donor-session';

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

  test('when the visitor taps Jiná částka, then the amount field takes the focus in the same tap', async ({
    page,
  }) => {
    await page.goto('/prispet');

    await page.getByRole('radio', { name: 'Jiná částka' }).tap();

    await expect(page.locator('#donate-custom-amount')).toBeFocused();
  });
});

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
