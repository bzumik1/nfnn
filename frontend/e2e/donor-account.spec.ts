import { expect, test } from './fixtures';
import { mockDonorApi, openSignInDialog, paymentQr, problem, session } from './donor-session';

test.describe('Given a visitor who wants a donor account', () => {
  test('when they register as a person, then the dialog asks them to confirm the e-mail and nobody is signed in', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await page.route('**/api/donors/auth/register', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
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
    await page.getByRole('button', { name: 'Vytvořit účet' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Zkontrolujte si e-mail' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Zkontrolujte si e-mail' })).toBeFocused();
    await expect(dialog.getByRole('status').filter({ hasText: /\S/ })).toContainText(
      'jana@example.cz',
    );
    await expect(page).toHaveURL(/\/$/);
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

  test('when they register a company by its identification number, then the name and seat come from the business register and only need checking', async ({
    page,
  }) => {
    const lookups: string[] = [];
    await page.route('**/api/donors/company-lookup?*', async (route) => {
      lookups.push(new URL(route.request().url()).searchParams.get('companyIdentifier') ?? '');
      await route.fulfill({
        json: {
          companyIdentifier: '45274649',
          name: 'ČEZ, a. s.',
          address: { street: 'Duhová 1444/2', city: 'Praha 4', postalCode: '140 00' },
        },
      });
    });
    const posted: unknown[] = [];
    await page.route('**/api/donors/auth/register', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });
    await mockDonorApi(page);

    await openSignInDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Registrace' }).click();
    await dialog.getByRole('radio', { name: 'Firma' }).click();
    await dialog.getByLabel('IČO').fill('452 746 49');

    await expect(dialog.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Údaje jsme doplnili z obchodního rejstříku (ARES). Zkontrolujte je.',
    );
    await expect(dialog.getByLabel('Název firmy')).toHaveValue('ČEZ, a. s.');
    await expect(dialog.getByLabel('Sídlo – ulice a číslo')).toHaveValue('Duhová 1444/2');
    await expect(dialog.getByLabel('PSČ')).toHaveValue('140 00');
    await expect(dialog.getByLabel('Město')).toHaveValue('Praha 4');
    await dialog.getByLabel('E-mail').fill('ucetni@cez.cz');
    await dialog.locator('#register-password').fill('correct horse battery');
    await dialog.getByRole('button', { name: 'Vytvořit účet' }).click();

    await expect(dialog.getByRole('heading', { name: 'Zkontrolujte si e-mail' })).toBeVisible();
    expect(lookups).toEqual(['45274649']);
    expect(posted).toEqual([
      {
        type: 'COMPANY',
        name: 'ČEZ, a. s.',
        companyIdentifier: '45274649',
        address: { street: 'Duhová 1444/2', city: 'Praha 4', postalCode: '140 00' },
        email: 'ucetni@cez.cz',
        password: 'correct horse battery',
        preferredLocale: 'cs',
      },
    ]);
  });

  test('when the company lookup fails while they register a company, then the form behaves as if there were no lookup', async ({
    page,
  }) => {
    let lookups = 0;
    await page.route('**/api/donors/company-lookup?*', async (route) => {
      lookups++;
      await route.fulfill({ status: 503, body: '' });
    });
    const posted: unknown[] = [];
    await page.route('**/api/donors/auth/register', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });
    await mockDonorApi(page);

    await openSignInDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Registrace' }).click();
    await dialog.getByRole('radio', { name: 'Firma' }).click();
    await dialog.getByLabel('IČO').fill('45274649');
    await expect.poll(() => lookups).toBe(1);

    await expect(dialog.getByLabel('Název firmy')).toHaveValue('');
    await expect(dialog.getByLabel('Název firmy')).toBeEditable();
    await expect(dialog.getByRole('status').filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(dialog.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
    await dialog.getByLabel('Název firmy').fill('Stavby Novák s.r.o.');
    await dialog.getByLabel('Sídlo – ulice a číslo').fill('Průmyslová 5');
    await dialog.getByLabel('PSČ').fill('415 01');
    await dialog.getByLabel('Město').fill('Teplice');
    await dialog.getByLabel('E-mail').fill('ucetni@stavby.cz');
    await dialog.locator('#register-password').fill('correct horse battery');
    await dialog.getByRole('button', { name: 'Vytvořit účet' }).click();

    await expect(dialog.getByRole('heading', { name: 'Zkontrolujte si e-mail' })).toBeVisible();
    expect(posted).toHaveLength(1);
  });

  test('when they sign in before confirming the e-mail, then the dialog offers to send the link again', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) =>
      route.fulfill(
        problem(
          401,
          'auth/email-not-verified',
          'E-mail ještě není potvrzený',
          'Otevřete odkaz z e-mailu, který jsme vám poslali při registraci, nebo si nechte poslat nový.',
        ),
      ),
    );
    const requested: unknown[] = [];
    await page.route('**/api/donors/auth/email-verification/request', async (route) => {
      requested.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();

    await expect(page.getByRole('alert')).toContainText('E-mail ještě není potvrzený');
    await page.getByRole('button', { name: 'Poslat ověřovací e-mail znovu' }).click();

    await expect(page.getByRole('dialog').getByRole('status')).toContainText(
      'Ověřovací e-mail jsme poslali znovu.',
    );
    expect(requested).toEqual([{ email: 'jana@example.cz' }]);
  });

  test('when they sign in with a wrong password, then the dialog stays and explains it', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) =>
      route.fulfill(
        problem(
          401,
          'auth/invalid-credentials',
          'Nesprávný e-mail nebo heslo',
          'Zkontrolujte prosím e-mail a heslo.',
        ),
      ),
    );
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('wrong horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();

    await expect(page.getByRole('alert')).toContainText('Nesprávný e-mail nebo heslo');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('when they sign in and sign out again, then the home page shows the sign-in button again', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await page.route('**/api/donors/auth/logout', (route) => route.fulfill({ status: 204 }));
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.nav-login', { hasText: 'Můj přehled' }).click();
    await expect(page).toHaveURL(/\/darce\/prehled$/);

    await page.locator('.topbar-logout').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.nav-login')).toHaveText('Přihlásit se');
  });

  test('when they go back to the home page from the overview, then they stay signed in and can return to it', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.nav-login', { hasText: 'Můj přehled' }).click();
    await expect(page).toHaveURL(/\/darce\/prehled$/);

    await page.getByRole('link', { name: 'Hlavní stránka' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.nav-login')).toHaveText('Můj přehled');
  });

  test('when they sign in from the home page, then the page stays, the header offers their overview and nothing stays highlighted', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.nav-login')).toHaveText('Můj přehled');
    await expect(page.locator('.nav-login')).not.toBeFocused();
    await expect(page.locator('nav.nav')).toBeFocused();
    await expect(page.locator('nav.nav')).toHaveCSS('outline-style', 'none');
  });

  test('when they open the portal without a session and sign in, then the portal opens', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await mockDonorApi(page);

    await page.goto('/darce/prehled');
    await expect(page).toHaveURL(/\/$/);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();

    await expect(page).toHaveURL(/\/darce\/prehled$/);
    await expect(page.locator('.topbar-donor')).toContainText('Jana Nováková');
  });

  test('when they open the portal without a session, then they land on the home page with the sign-in dialog', async ({
    page,
  }) => {
    await mockDonorApi(page);

    await page.goto('/darce/prehled');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#login-email')).toBeVisible();
  });

  test('when they come back with a remembered session, then the portal opens without signing in again', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await mockDonorApi(page);

    await page.goto('/darce/prehled');

    await expect(page.locator('.topbar-donor')).toContainText('Jana Nováková');
  });

  test('when they come back with a remembered session to the home page, then the QR payment carries their variable symbol', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    const requestedSymbols: (string | null)[] = [];
    await page.route(
      (url) => url.pathname === '/api/donations/payment-qr',
      async (route) => {
        requestedSymbols.push(new URL(route.request().url()).searchParams.get('variableSymbol'));
        await route.fulfill({
          json: { ...paymentQr, spayd: `${paymentQr.spayd}*X-VS:1234567890` },
        });
      },
    );

    await page.goto('/');

    await expect(page.locator('#prispet')).toContainText('Variabilní symbol');
    await expect(page.locator('#prispet')).toContainText('1234567890');
    await expect.poll(() => requestedSymbols).toEqual(['1234567890', '1234567890', '1234567890']);
  });
});
