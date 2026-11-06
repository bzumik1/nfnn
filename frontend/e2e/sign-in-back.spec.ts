import { expect, test } from './fixtures';
import { browserEntries, stepBack } from './app-history';
import { mockDonorApi, secondFactorRecovery, secondFactorRequired, session } from './donor-session';

test.describe('Given a visitor on a phone with the sign-in dialog open', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.goto('/zasady-ochrany-osobnich-udaju');
    await page
      .getByRole('banner')
      .getByRole('link', { name: 'Nová naděje – nadační fond' })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('when the app steps back, as its swipe does, then the dialog closes and the page under it stays', async ({
    page,
  }) => {
    const address = page.url();

    await stepBack(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url()).toBe(address);
    await stepBack(page);
    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
  });

  test('when they press the browser’s Back, then the browser leaves the site, which holds one entry of it', async ({
    page,
  }) => {
    expect(await browserEntries(page)).toBe(2);

    await page.goBack();

    await expect(page).toHaveURL('about:blank');
  });

  test('when they close it with its cross, then a step back returns to the page before', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Zavřít' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await stepBack(page);

    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
  });

  test('when the app steps back at the code from the app, then the dialog returns to the password, and another step closes it', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    const address = page.url();

    await stepBack(page);

    await expect(page.locator('#login-email')).toBeFocused();
    await expect(page.getByLabel('Kód z aplikace')).toHaveCount(0);
    await stepBack(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url()).toBe(address);
  });

  test('when the app steps back in the recovery by payment, then the dialog returns to the code', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    await page.route('**/api/donors/auth/login/second-factor/recovery', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(secondFactorRecovery),
      }),
    );
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await page.getByRole('button', { name: 'Obnovit přístup platbou' }).click();
    await expect(page.getByRole('heading', { name: 'Obnova přístupu platbou' })).toBeFocused();

    await stepBack(page);

    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('when they sign in, then the dialog takes its step back and a step back returns to the page before', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await stepBack(page);

    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
  });
});

test.describe('Given a visitor on a phone who opens the overview without signing in', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.goto('/darce/prehled');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => browserEntries(page)).toBe(2);
  });

  test('when the app steps back, then the dialog closes on the home page', async ({ page }) => {
    await stepBack(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test('when they sign in, then the overview opens and a step back returns to the home page', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page).toHaveURL(/\/darce\/prehled$/);

    await stepBack(page);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
