import { expect, test } from './fixtures';
import { mockDonorApi, secondFactorRecovery, secondFactorRequired, session } from './donor-session';

test.describe('Given a visitor on a phone with the sign-in dialog open', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.goto('/zasady-ochrany-osobnich-udaju');
    await page.goto('/');
    await page.getByRole('button', { name: 'Otevřít menu' }).click();
    await page.locator('button.mobile-login').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('when they press Back, then the dialog closes and the page under it stays', async ({
    page,
  }) => {
    const address = page.url();

    await page.goBack();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url()).toBe(address);
    await page.goBack();
    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
  });

  test('when they close it with its cross, then Back leaves for the page before as usual', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Zavřít' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goBack();

    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
  });

  test('when they press Back at the code from the app, then the dialog returns to the password, and Back again closes it', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    const address = page.url();

    await page.goBack();

    await expect(page.locator('#login-email')).toBeFocused();
    await expect(page.getByLabel('Kód z aplikace')).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url()).toBe(address);
  });

  test('when they press Back in the recovery by payment, then the dialog returns to the code', async ({
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

    await page.goBack();

    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('when they sign in, then the dialog takes its entry back and Back leaves for the page before', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goBack();

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
    await expect.poll(() => page.evaluate(() => history.length)).toBe(3);
  });

  test('when they press Back, then the dialog closes on the home page', async ({ page }) => {
    await page.goBack();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test('when they sign in, then the overview opens and Back returns to the home page', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page).toHaveURL(/\/darce\/prehled$/);

    await page.goBack();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
