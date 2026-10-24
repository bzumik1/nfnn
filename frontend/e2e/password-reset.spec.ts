import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openSignInDialog, problem } from './donor-session';

async function chooseNewPassword(page: Page): Promise<void> {
  await page.locator('#reset-password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Uložit nové heslo' }).click();
}

test.describe('Given a donor who forgot the password', () => {
  test('when they ask for a link in the sign-in dialog, then the dialog says the e-mail is on its way', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await page.route('**/api/donors/auth/password-reset/request', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });
    await mockDonorApi(page);

    await openSignInDialog(page);
    await page.locator('#login-email').fill(' jana@example.cz ');
    await page.getByRole('dialog').getByRole('button', { name: 'Zapomněli jste heslo?' }).click();
    await expect(page.locator('#reset-email')).toBeFocused();
    await expect(page.locator('#reset-email')).toHaveValue('jana@example.cz');
    await page.getByRole('button', { name: 'Odeslat odkaz' }).click();

    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Zkontrolujte si e-mail' }),
    ).toBeFocused();
    await expect(page.getByRole('dialog')).toContainText(
      'Pokud k adrese jana@example.cz existuje účet',
    );
    expect(posted).toEqual([{ email: 'jana@example.cz' }]);
  });

  test('when they open the link and choose a new password, then the token leaves the address bar and they can sign in', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await page.route('**/api/donors/auth/password-reset/confirm', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 204 });
    });

    await page.goto('/obnova-hesla#token=abc');

    await expect(page.getByRole('heading', { name: 'Obnovte si přístup' })).toBeVisible();
    await expect(page).toHaveURL(/\/obnova-hesla$/);
    expect(page.url()).not.toContain('token');
    await expect(page).toHaveTitle('Nové heslo | Nová naděje – nadační fond');

    await chooseNewPassword(page);

    await expect(page.getByRole('heading', { name: 'Heslo je změněno' })).toBeVisible();
    expect(posted).toEqual([{ token: 'abc', password: 'correct horse battery' }]);

    await page.locator('.ui-panel-page').getByRole('button', { name: 'Přihlásit se' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#login-email')).toBeVisible();
  });

  test('when the link has expired, then the page offers a new link in the dialog', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/password-reset/confirm', (route) =>
      route.fulfill(
        problem(
          400,
          'donors/invalid-password-reset-token',
          'Odkaz pro obnovu hesla je neplatný nebo vypršel',
          'Požádejte prosím o nový odkaz.',
        ),
      ),
    );

    await page.goto('/obnova-hesla#token=abc');
    await chooseNewPassword(page);

    await expect(
      page.getByRole('heading', { name: 'Odkaz je neplatný nebo vypršel' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Požádat o nový odkaz' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#reset-email')).toBeVisible();
  });

  test('when they open the page without the token, then it says the link is incomplete', async ({
    page,
  }) => {
    await page.goto('/obnova-hesla');

    await expect(page.getByRole('heading', { name: 'Odkaz je neúplný' })).toBeVisible();
    await expect(page.locator('#reset-password')).toHaveCount(0);
  });
});
