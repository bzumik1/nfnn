import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, problem, session } from './donor-session';

const ADMINISTRATORS = '/api/admin/donors/administrators';
const PEOPLE = '/api/admin/content/people';
const PORTRAIT_ID = '019a1c00-0000-7000-8000-00000000c101';
const PETR_ID = '019a1c00-0000-7000-8000-00000000a002';

const jana = {
  donorId: administrator.id,
  name: 'Jana Nováková',
  email: 'jana@example.cz',
  secondFactorEnabled: true,
};

const petr = {
  donorId: PETR_ID,
  name: 'Petr Svoboda',
  email: 'petr@example.cz',
  secondFactorEnabled: true,
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator on the administrators page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they add a registered donor by e-mail, then the donor is listed and the status explains the two-factor step', async ({
    page,
  }) => {
    const lists = [[jana], [jana, { ...petr, secondFactorEnabled: false }]];
    const posted: unknown[] = [];
    await page.route(
      (url) => url.pathname === ADMINISTRATORS,
      (route) => {
        if (route.request().method() === 'POST') {
          posted.push(route.request().postDataJSON());
          return route.fulfill({ status: 201, json: { ...petr, secondFactorEnabled: false } });
        }
        return route.fulfill({ json: { items: lists.length > 1 ? lists.shift() : lists[0] } });
      },
    );

    await page.route(
      (url) => url.pathname === PEOPLE,
      (route) =>
        route.fulfill({
          json: {
            members: [
              {
                id: '019a1c00-0000-7000-8000-00000000c001',
                name: 'Jana Nováková',
                role: 'Zakladatelka',
                position: 0,
                onBoard: true,
                boardNote: null,
                featured: true,
                portrait: {
                  id: PORTRAIT_ID,
                  url: `/api/content/media/${PORTRAIT_ID}`,
                  width: 640,
                  height: 640,
                },
                webSignature: null,
                personalEmail: 'jana@example.cz',
                fundEmail: null,
                linkedToAccount: true,
              },
            ],
            note: null,
            footnote: null,
          },
        }),
    );

    await page.goto('/sprava/spravci');

    await expect(page).toHaveTitle('Správci | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Správci' })).toBeFocused();
    await expect(page.locator('.administrator-row')).toHaveCount(1);
    await expect(page.locator('.administrator-row').first()).toContainText('To jste vy');
    await expect(
      page.locator('.administrator-row').first().locator('app-avatar img'),
    ).toHaveAttribute('src', `/api/content/media/${PORTRAIT_ID}?w=480`);

    await page.getByLabel('E-mail dárce').fill('petr@example.cz');
    await page.getByRole('button', { name: 'Přidat správce' }).click();

    await expect(page.getByRole('status').filter({ hasNotText: 'Načítáme' })).toHaveText(
      'Petr Svoboda je teď správce. Správa se mu otevře, až se přihlásí s kódem z ověřovací aplikace nebo přístupovým klíčem.',
    );
    expect(posted).toEqual([{ email: 'petr@example.cz' }]);
    await expect(page.locator('.administrator-row')).toHaveCount(2);
    await expect(page.locator('.administrator-row').nth(1)).toContainText(
      'Dvoufaktorové ověření vypnuté',
    );
    await expect(page.locator('.administrator-row').nth(1).locator('app-avatar')).toHaveText('PS');
    await expect(page.getByLabel('E-mail dárce')).toHaveValue('');
  });

  test('when the e-mail is not registered, then the form keeps the value and shows the refusal', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === ADMINISTRATORS,
      (route) => {
        if (route.request().method() === 'POST') {
          return route.fulfill(
            problem(
              404,
              'donors/email-not-registered',
              'S tímto e-mailem není nikdo registrován',
              'Správcem může být jen registrovaný dárce.',
            ),
          );
        }
        return route.fulfill({ json: { items: [jana] } });
      },
    );

    await page.goto('/sprava/spravci');
    await page.getByRole('button', { name: 'Přidat správce' }).click();
    await expect(page.getByLabel('E-mail dárce')).toBeFocused();
    await expect(page.getByText('Vyplňte prosím e-mail registrovaného dárce.')).toBeVisible();

    await page.getByLabel('E-mail dárce').fill('nikdo@example.cz');
    await page.getByRole('button', { name: 'Přidat správce' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText(
      'S tímto e-mailem není nikdo registrován',
    );
    await expect(page.getByLabel('E-mail dárce')).toHaveValue('nikdo@example.cz');
  });

  test('when they remove another administrator and turn off two-factor authentication, then each asks for a confirmation first', async ({
    page,
  }) => {
    const calls: string[] = [];
    let items = [jana, petr];
    await page.route(
      (url) => url.pathname === ADMINISTRATORS,
      (route) => route.fulfill({ json: { items } }),
    );
    await page.route(
      (url) => url.pathname === `/api/admin/donors/${PETR_ID}/second-factor/reset`,
      (route) => {
        calls.push('reset');
        items = [jana, { ...petr, secondFactorEnabled: false }];
        return route.fulfill({ status: 204 });
      },
    );
    await page.route(
      (url) => url.pathname === `${ADMINISTRATORS}/${PETR_ID}`,
      (route) => {
        calls.push(route.request().method());
        items = [jana];
        return route.fulfill({ status: 204 });
      },
    );

    await page.goto('/sprava/spravci');
    const petrRow = page.locator('.administrator-row').nth(1);

    await petrRow.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }).click();
    await expect(petrRow).toContainText('Ověřili jste, že žádá majitel účtu');
    await expect(petrRow.getByRole('button', { name: 'Ponechat' })).toBeFocused();
    await petrRow.getByRole('button', { name: 'Ponechat' }).click();
    await expect(
      petrRow.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }),
    ).toBeFocused();
    expect(calls).toEqual([]);

    await petrRow.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }).click();
    await petrRow.getByRole('button', { name: 'Ano, vypnout' }).click();
    await expect(page.getByRole('status').filter({ hasNotText: 'Načítáme' })).toContainText(
      'Dvoufaktorové ověření u Petr Svoboda je vypnuté',
    );
    await expect(petrRow).toContainText('Správa se mu otevře jen přístupovým klíčem.');
    await expect(
      petrRow.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }),
    ).toHaveCount(0);

    await petrRow.getByRole('button', { name: 'Odebrat roli správce' }).click();
    await expect(petrRow).toContainText(
      'Petr Svoboda přestane být správcem a všechna jeho přihlášení skončí. Jeho dárcovský účet zůstane. Odebrat roli správce?',
    );
    await petrRow.getByRole('button', { name: 'Ano, odebrat' }).click();

    await expect(page.getByRole('status').filter({ hasNotText: 'Načítáme' })).toHaveText(
      'Petr Svoboda už není správce. Všechna jeho přihlášení jsme ukončili.',
    );
    await expect(page.locator('.administrator-row')).toHaveCount(1);
    expect(calls).toEqual(['reset', 'DELETE']);
  });
});
