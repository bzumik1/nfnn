import { expect, test } from './fixtures';
import { mockDonorApi, problem, session } from './donor-session';

test.describe('Given a visitor on the donate section without an account', () => {
  test('when they register from there, then the registration asks the e-mail link to lead back to the donate section', async ({
    page,
  }) => {
    const posted: { returnTo?: string }[] = [];
    await page.route('**/api/donors/auth/register', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });
    await mockDonorApi(page);

    await page.goto('/#prispet');
    await page.locator('#prispet').getByRole('button', { name: 'Založit účet' }).click();
    await page.locator('#register-name').fill('Jana Nováková');
    await page.locator('#register-street').fill('Dlouhá 12');
    await page.locator('#register-city').fill('Ústí nad Labem');
    await page.locator('#register-postal-code').fill('400 01');
    await page.locator('#register-email').fill('jana@example.cz');
    await page.locator('#register-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Vytvořit účet' }).click();

    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Zkontrolujte si e-mail' }),
    ).toBeVisible();
    expect(posted.map((body) => body.returnTo)).toEqual(['/#prispet']);
  });
});

test.describe('Given a visitor who registered and received the confirmation e-mail', () => {
  test('when they open the link, then the token leaves the address bar, the account opens and the overview is one click away', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await page.route('**/api/donors/auth/email-verification/confirm', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill(session(200));
    });
    await mockDonorApi(page);

    await page.goto('/potvrzeni-emailu#token=abc');

    await expect(page.getByRole('heading', { name: 'E-mail je potvrzený' })).toBeVisible();
    await expect(page).toHaveURL(/\/potvrzeni-emailu$/);
    expect(page.url()).not.toContain('token');
    await expect(page).toHaveTitle('Potvrzení e-mailu | Nová naděje – nadační fond');
    expect(posted).toEqual([{ token: 'abc' }]);

    await page.getByRole('button', { name: 'Přejít do přehledu' }).click();

    await expect(page).toHaveURL(/\/darce\/prehled$/);
    await expect(page.locator('.topbar-donor')).toContainText('Jana Nováková');
    await expect(page.locator('.symbol-value')).toHaveText('1234567890');
  });

  test('when they registered from the donate section and open the link, then they land back there signed in and the bank details carry their variable symbol', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/email-verification/confirm', (route) =>
      route.fulfill(session(200)),
    );
    await mockDonorApi(page);

    await page.goto('/potvrzeni-emailu#token=abc&returnTo=%2F%23prispet');

    await expect(page.getByRole('heading', { name: 'E-mail je potvrzený' })).toBeVisible();
    expect(page.url()).not.toContain('prispet');
    await page.getByRole('button', { name: 'Pokračovat k příspěvku' }).click();

    await expect(page).toHaveURL(/\/#prispet$/);
    await expect(page.locator('#prispet .bank')).toContainText('1234567890');
  });

  test('when the link has expired, then the page sends a new one to the address they enter', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/email-verification/confirm', (route) =>
      route.fulfill(
        problem(
          400,
          'donors/invalid-email-verification-token',
          'Odkaz pro potvrzení e-mailu je neplatný nebo vypršel',
          'Nechte si prosím poslat nový odkaz.',
        ),
      ),
    );
    const requested: unknown[] = [];
    await page.route('**/api/donors/auth/email-verification/request', async (route) => {
      requested.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });

    await page.goto('/potvrzeni-emailu#token=abc');

    await expect(
      page.getByRole('heading', { name: 'Odkaz je neplatný nebo vypršel' }),
    ).toBeVisible();

    await page.locator('#verification-email').fill(' jana@example.cz ');
    await page.getByRole('button', { name: 'Poslat nový odkaz' }).click();

    await expect(page.getByRole('heading', { name: 'E-mail odeslán' })).toBeVisible();
    expect(requested).toEqual([{ email: 'jana@example.cz' }]);
  });

  test('when they open the page without the token, then it says the link is incomplete', async ({
    page,
  }) => {
    await page.goto('/potvrzeni-emailu');

    await expect(page.getByRole('heading', { name: 'Odkaz je neúplný' })).toBeVisible();
    await expect(page.locator('#verification-email')).toBeVisible();
  });
});
