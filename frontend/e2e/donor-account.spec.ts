import { expect, test } from '@playwright/test';
import { mockDonorApi, openSignInDialog, paymentQr, problem, session } from './donor-session';

test.describe('Given a visitor who wants a donor account', () => {
  test('when they register as a person, then the donor portal opens with their name and variable symbol', async ({ page }) => {
    const posted: unknown[] = [];
    await page.route('**/api/donors/auth/register', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill(session(201));
    });
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.getByRole('button', { name: 'Registrace' }).click();
    await page.locator('#register-name').fill('Jana Nováková');
    await page.locator('#register-street').fill('Dlouhá 12');
    await page.locator('#register-city').fill('Ústí nad Labem');
    await page.locator('#register-postal-code').fill('400 01');
    await page.locator('#register-email').fill('jana@example.cz');
    await page.locator('#register-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Registrovat' }).click();

    await expect(page).toHaveURL(/\/donor\/prehled$/);
    await expect(page.locator('.topbar-greeting')).toContainText('Jana Nováková');
    await expect(page.locator('.symbol-value')).toHaveText('1234567890');
    expect(posted).toEqual([
      {
        type: 'PERSON',
        name: 'Jana Nováková',
        companyIdentifier: null,
        address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
        email: 'jana@example.cz',
        password: 'correct horse battery',
        preferredLocale: 'cs',
      },
    ]);
  });

  test('when they sign in with a wrong password, then the dialog stays and explains it', async ({ page }) => {
    await page.route('**/api/donors/auth/login', (route) =>
      route.fulfill(problem(401, 'auth/invalid-credentials', 'Nesprávný e-mail nebo heslo', 'Zkontrolujte prosím e-mail a heslo.')),
    );
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('wrong horse battery');
    await page.getByRole('dialog').locator('.form-submit').click();

    await expect(page.getByRole('alert')).toContainText('Nesprávný e-mail nebo heslo');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('when they sign in and sign out again, then the home page shows the sign-in button again', async ({ page }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await page.route('**/api/donors/auth/logout', (route) => route.fulfill({ status: 204 }));
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.form-submit').click();
    await expect(page).toHaveURL(/\/donor\/prehled$/);

    await page.locator('.topbar-logout').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.nav-login')).toHaveText('Přihlásit se');
  });

  test('when they go back to the home page from the overview, then they stay signed in and can return to it', async ({ page }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.form-submit').click();
    await expect(page).toHaveURL(/\/donor\/prehled$/);

    await page.getByRole('link', { name: 'Hlavní stránka' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.nav-login')).toHaveText('Můj přehled');
  });

  test('when they open the portal without a session, then they land on the home page with the sign-in dialog', async ({ page }) => {
    await mockDonorApi(page);

    await page.goto('/donor/prehled');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#login-email')).toBeVisible();
  });

  test('when they come back with a remembered session, then the portal opens without signing in again', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await mockDonorApi(page);

    await page.goto('/donor/prehled');

    await expect(page.locator('.topbar-greeting')).toContainText('Jana Nováková');
  });

  test('when they come back with a remembered session to the home page, then the QR payment carries their variable symbol', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    const requestedSymbols: (string | null)[] = [];
    await page.route(
      (url) => url.pathname === '/api/donations/payment-qr',
      async (route) => {
        requestedSymbols.push(new URL(route.request().url()).searchParams.get('variableSymbol'));
        await route.fulfill({ json: { ...paymentQr, spayd: `${paymentQr.spayd}*X-VS:1234567890` } });
      },
    );

    await page.goto('/');

    await expect(page.locator('#donate')).toContainText('Variabilní symbol');
    await expect(page.locator('#donate')).toContainText('1234567890');
    expect(requestedSymbols).toEqual(['1234567890']);
  });
});
