import { expect, test } from '@playwright/test';
import {
  administrator,
  CHALLENGE,
  donor,
  mockDonorApi,
  openSignInDialog,
  problem,
  secondFactorEnrolment,
  secondFactorRequired,
  session,
  signIn,
} from './donor-session';

const protectedDonor = {
  ...donor,
  secondFactor: { enabled: true, neededForAdministration: false },
};

test.describe('Given a donor who protects the account with an authenticator app', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they sign in, then the password alone is not enough and the code from the app opens the overview', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    const completed: unknown[] = [];
    await page.route('**/api/donors/auth/login/second-factor', async (route) => {
      completed.push(route.request().postDataJSON());
      await route.fulfill(session(200, protectedDonor));
    });

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.form-submit').click();

    const code = page.getByLabel('Kód z aplikace');
    await expect(code).toBeFocused();
    await expect(page.getByRole('dialog')).toContainText(
      'Přihlášení dokončíte kódem z ověřovací aplikace',
    );
    await code.fill('287082');
    await page.getByRole('dialog').locator('.form-submit').click();

    await expect(page).toHaveURL(/\/darce\/prehled$/);
    expect(completed).toEqual([{ challenge: CHALLENGE, code: '287082' }]);
    await expect(page.locator('.account-data')).toContainText('Zapnutý');
  });

  test('when they type a wrong code and then the challenge expires, then the dialog says so and goes back to the password', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    let attempts = 0;
    await page.route('**/api/donors/auth/login/second-factor', (route) => {
      attempts++;
      return route.fulfill(
        attempts === 1
          ? problem(
              401,
              'auth/invalid-second-factor-code',
              'Nesprávný kód',
              'Zadejte prosím aktuální kód z ověřovací aplikace; každý kód platí jen jednou.',
            )
          : problem(
              401,
              'auth/invalid-second-factor-challenge',
              'Přihlášení vypršelo',
              'Zadejte prosím znovu e-mail a heslo.',
            ),
      );
    });

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.form-submit').click();
    await page.getByLabel('Kód z aplikace').fill('000000');
    await page.getByRole('dialog').locator('.form-submit').click();

    await expect(page.getByRole('alert')).toContainText('Nesprávný kód.');
    await expect(page.getByLabel('Kód z aplikace')).toBeVisible();

    await page.getByLabel('Kód z aplikace').fill('111111');
    await page.getByRole('dialog').locator('.form-submit').click();

    await expect(page.getByRole('alert')).toContainText(
      'Přihlášení vypršelo. Zadejte prosím znovu e-mail a heslo.',
    );
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('when they turn the second factor on in the overview, then the QR code and the key appear and the first code enables it', async ({
    page,
  }) => {
    const posted: { path: string; body: unknown }[] = [];
    await page.route('**/api/donors/me/second-factor/setup', async (route) => {
      posted.push({ path: 'setup', body: route.request().postDataJSON() });
      await route.fulfill({ json: secondFactorEnrolment });
    });
    await page.route('**/api/donors/me/second-factor/confirm', async (route) => {
      posted.push({ path: 'confirm', body: route.request().postDataJSON() });
      await route.fulfill(session(200, protectedDonor));
    });
    await signIn(page);

    await page.getByRole('button', { name: 'Zapnout druhý faktor' }).click();
    await expect(page.getByLabel('Současné heslo')).toBeFocused();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Pokračovat' }).click();

    const qr = page.getByRole('img', { name: 'QR kód s nastavením pro ověřovací aplikaci' });
    await expect(qr).toBeVisible();
    expect(await qr.getAttribute('src')).toBe(
      `data:image/png;base64,${secondFactorEnrolment.qrPngBase64}`,
    );
    await expect(page.locator('.account-secret-value')).toHaveText(
      'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ',
    );
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    await page.getByLabel('Kód z aplikace').fill('287082');
    await page.getByRole('button', { name: 'Zapnout druhý faktor' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Druhý faktor' })).toContainText(
      'Druhý faktor je zapnutý.',
    );
    await expect(page.locator('.account-data')).toContainText('Zapnutý');
    await expect(page.getByRole('button', { name: 'Vypnout druhý faktor' })).toBeFocused();
    expect(posted).toEqual([
      { path: 'setup', body: { password: 'correct horse battery' } },
      { path: 'confirm', body: { code: '287082' } },
    ]);
  });

  test('when they turn the second factor off, then the password and the code go together and the card says it is off', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await page.route('**/api/donors/me/second-factor/disable', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill(session(200, donor));
    });
    await signIn(page, protectedDonor);

    await page.getByRole('button', { name: 'Vypnout druhý faktor' }).click();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByLabel('Kód z aplikace').fill('287082');
    await page.getByRole('button', { name: 'Vypnout druhý faktor' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Druhý faktor' })).toContainText(
      'Druhý faktor jsme vypnuli.',
    );
    await expect(page.locator('.account-data')).toContainText('Vypnutý');
    expect(posted).toEqual([{ password: 'correct horse battery', code: '287082' }]);
  });

  test('when an administrator has no second factor yet, then the overview says the administration waits for it and offers no link to it', async ({
    page,
  }) => {
    await signIn(page, {
      ...administrator,
      roles: ['DONOR'],
      secondFactor: { enabled: false, neededForAdministration: true },
    });

    await expect(page.locator('.account-hint')).toContainText(
      'Správa se vám otevře, až zapnete druhý faktor',
    );
    await expect(page.getByRole('link', { name: 'Správa' })).toHaveCount(0);
  });
});
