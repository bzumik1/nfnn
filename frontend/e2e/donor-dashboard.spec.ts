import { expect, test } from '@playwright/test';
import {
  donationItem,
  donor,
  mockDonorApi,
  noDonations,
  problem,
  session,
  signIn,
} from './donor-session';

function donation(
  id: string,
  receivedAt: string,
  amountMinor: number,
  status = 'RECEIVED',
  receiptAvailable = status === 'RECEIVED',
) {
  return donationItem({ id, receivedAt, amountMinor, status, receiptAvailable });
}

const twoYears = {
  summary: {
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
    lastReceivedAt: '2026-03-15',
    byYear: [
      { year: 2026, count: 2, totalAmountMinor: 150000 },
      { year: 2025, count: 1, totalAmountMinor: 25000 },
    ],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2025,
  },
  list: {
    items: [
      donation('0192f0f1-0000-7000-8000-000000000004', '2026-03-15', 50000),
      donation('0192f0f1-0000-7000-8000-000000000003', '2026-01-10', 100000),
      donation('0192f0f1-0000-7000-8000-000000000002', '2025-11-05', 25000),
      donation('0192f0f1-0000-7000-8000-000000000001', '2025-08-20', 200000, 'REFUNDED'),
    ],
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
  },
};

const withReceipts = {
  ...twoYears,
  receipts: { singleFileName: 'potvrzeni-o-daru-2026-000001.pdf' },
};

const receiptsFrom2026 = {
  summary: { ...twoYears.summary, receiptsAvailableFrom: 2026 },
  list: {
    ...twoYears.list,
    items: twoYears.list.items.map((item) => ({
      ...item,
      receiptAvailable: item.receiptAvailable && item.receivedAt >= '2026-01-01',
    })),
  },
};

test.describe('Given a signed-in donor', () => {
  test('when they have given in two years, then the dashboard shows their totals, their payments and each year on its own', async ({
    page,
  }) => {
    await mockDonorApi(page, twoYears);

    await signIn(page);

    await expect(page.locator('.stat-value')).toHaveText(['1 750 Kč', '3', '15. 03. 2026']);
    await expect(page.locator('.payments-card tbody tr')).toHaveCount(4);
    await expect(page.locator('.payments-card tbody tr').first().locator('td')).toHaveText([
      '15. 03. 2026',
      '500 Kč',
      'Obecný příspěvek',
      'Přijato',
      'Stáhnout PDF',
    ]);
    await expect(page.locator('.payments-card tbody tr').last()).toContainText('Vráceno');
    await expect(page.locator('.yearly-count')).toHaveText('2 příspěvky v roce 2026');
    await expect(page.locator('.yearly-total')).toHaveText('1 500 Kč celkem');

    await page.locator('.year-toggle').getByRole('button', { name: '2025' }).click();

    await expect(page.locator('.yearly-count')).toHaveText('1 příspěvek v roce 2025');
    await expect(page.locator('.yearly-total')).toHaveText('250 Kč celkem');
    await expect(page.locator('.yearly-pdf')).toHaveText('↓ PDF za rok 2025');
  });

  test('when they download the receipt of a completed year, then the browser saves the PDF under the name the server gives', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);

    await expect(page.locator('.yearly-pdf')).toBeDisabled();
    await expect(page.locator('.yearly-hint')).toHaveText(
      'Potvrzení za rok 2026 bude ke stažení po skončení roku.',
    );
    await page.locator('.year-toggle').getByRole('button', { name: '2025' }).click();
    await expect(page.locator('.yearly-hint')).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.yearly-pdf').click(),
    ]);

    expect(download.suggestedFilename()).toBe('potvrzeni-o-darech-2025.pdf');
    await expect(page.locator('.yearly-pdf')).toHaveText('↓ PDF za rok 2025');
  });

  test('when they download the receipt of one payment, then the browser saves that PDF and a refunded payment offers none', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);

    await expect(
      page.locator('.payments-card tbody tr').last().locator('.download-btn'),
    ).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page
        .locator('.payments-card tbody tr')
        .nth(1)
        .getByRole('button', { name: 'Stáhnout PDF' })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe('potvrzeni-o-daru-2026-000001.pdf');
  });

  test('when some gifts arrived before the first receipt year, then those offer no PDF, nor does their year, and lines say from when receipts are issued', async ({
    page,
  }) => {
    await mockDonorApi(page, receiptsFrom2026);
    await signIn(page);

    const rows = page.locator('.payments-card tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1).getByRole('button', { name: 'Stáhnout PDF' })).toBeVisible();
    await expect(rows.nth(2)).toContainText('Přijato');
    await expect(rows.nth(2).getByRole('button', { name: 'Stáhnout PDF' })).toHaveCount(0);
    await expect(page.locator('.payments-card .receipts-from')).toHaveText(
      'Potvrzení o daru tu vystavujeme za dary přijaté od 1. ledna 2026, u starších darů proto tlačítko „Stáhnout PDF“ chybí.',
    );
    await expect(page.locator('.yearly-pdf')).toHaveText('↓ PDF za rok 2026');

    await page.locator('.year-toggle').getByRole('button', { name: '2025' }).click();

    await expect(page.locator('.yearly-count')).toHaveText('1 příspěvek v roce 2025');
    await expect(page.locator('.yearly-pdf')).toHaveCount(0);
    await expect(page.locator('.yearly-hint')).toHaveText(
      'Potvrzení za rok tu vystavujeme za dary od roku 2026.',
    );
  });

  test('when no donation has arrived yet, then the dashboard shows zeros and explains how a gift appears', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);

    await signIn(page);

    await expect(page.locator('.stat-value')).toHaveText(['0 Kč', '0', '—']);
    await expect(page.locator('.yearly-empty')).toHaveText(
      'Zatím tu nemáme žádný váš dar. Jakmile dorazí platba s vaším variabilním symbolem, objeví se tady. Posíláte trvalým příkazem?',
    );
    await expect(page.locator('.year-toggle')).toHaveCount(0);
    await expect(page.locator('.yearly-pdf')).toHaveCount(0);
    await expect(page.locator('.payments-card table')).toHaveCount(0);
    await expect(page.locator('.payments-empty')).toHaveText('Zatím tu není žádná platba.');
    await expect(page.locator('.symbol-value')).toHaveText('1234567890');
  });

  test('when no donation has arrived yet and they follow the standing order link, then their bank accounts take the focus', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    await signIn(page);

    await page.getByRole('link', { name: 'Posíláte trvalým příkazem?' }).click();

    await expect(page.getByRole('heading', { name: 'Moje bankovní účty' })).toBeFocused();
    await expect(page.locator('.accounts-nudge')).toContainText(
      'Posíláte nám dary trvalým příkazem se starším variabilním symbolem?',
    );
    await expect(page).toHaveURL(/\/donor\/prehled$/);
  });

  test('when they correct their address, then the overview saves it and shows it as the receipts will', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    const patched: unknown[] = [];
    await page.route('**/api/donors/me', async (route) => {
      if (route.request().method() !== 'PATCH') {
        return route.fallback();
      }
      const body = route.request().postDataJSON();
      patched.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...donor, ...body }),
      });
    });

    await signIn(page);
    await page.getByRole('button', { name: 'Upravit údaje' }).click();
    await expect(page.getByLabel('Jméno a příjmení')).toBeFocused();
    await page.getByLabel('Ulice a číslo').fill('Krátká 3');
    await page.getByLabel('Jazyk potvrzení').selectOption('en');
    await page.getByRole('button', { name: 'Uložit' }).click();

    await expect(page.locator('.profile-data')).toContainText('Krátká 3, 400 01 Ústí nad Labem');
    await expect(page.locator('.profile-data')).toContainText('angličtina (dvojjazyčné)');
    await expect(page.getByRole('status').filter({ hasText: 'Údaje jsme uložili.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upravit údaje' })).toBeFocused();
    expect(patched).toEqual([
      {
        name: 'Jana Nováková',
        address: { street: 'Krátká 3', city: 'Ústí nad Labem', postalCode: '400 01' },
        preferredLocale: 'en',
      },
    ]);
  });

  test('when they change the password with the current one, then the overview keeps them signed in and says the other sign-ins ended', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    const sent: unknown[] = [];
    await page.route('**/api/donors/me/password', async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill(session(200));
    });

    await signIn(page);
    await page.getByRole('button', { name: 'Změnit heslo' }).click();
    await expect(page.getByLabel('Současné heslo')).toBeFocused();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByLabel('Nové heslo', { exact: true }).fill('a brand new passphrase');
    await page.getByLabel('Nové heslo znovu').fill('a brand new passphrase');
    await page.getByRole('button', { name: 'Změnit heslo' }).last().click();

    await expect(page.getByRole('status').filter({ hasText: 'Heslo jsme změnili.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Změnit heslo' })).toBeFocused();
    await expect(page).toHaveURL(/\/donor\/prehled$/);
    expect(sent).toEqual([
      { currentPassword: 'correct horse battery', newPassword: 'a brand new passphrase' },
    ]);
  });

  test('when they ask for a new e-mail, then the overview sends the link and keeps showing the current address until it is confirmed', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    const sent: unknown[] = [];
    await page.route('**/api/donors/me/email-change', async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });

    await signIn(page);
    await page.getByRole('button', { name: 'Změnit e-mail' }).click();
    await expect(page.getByLabel('Nový e-mail')).toBeFocused();
    await page.getByLabel('Nový e-mail').fill('jana.nova@example.cz');
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Poslat potvrzovací odkaz' }).click();

    await expect(
      page.getByRole('status').filter({ hasText: 'Odkaz jsme poslali na jana.nova@example.cz.' }),
    ).toBeVisible();
    await expect(page.locator('.account-data')).toContainText('jana@example.cz');
    await expect(page.getByRole('button', { name: 'Změnit e-mail' })).toBeFocused();
    expect(sent).toEqual([{ newEmail: 'jana.nova@example.cz', password: 'correct horse battery' }]);
  });

  test('when the current password is wrong, then the e-mail form stays and shows the reason', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    await page.route('**/api/donors/me/email-change', (route) =>
      route.fulfill(
        problem(
          400,
          'donors/wrong-password',
          'Nesprávné současné heslo',
          'Zadejte prosím heslo, kterým se teď přihlašujete.',
        ),
      ),
    );

    await signIn(page);
    await page.getByRole('button', { name: 'Změnit e-mail' }).click();
    await page.getByLabel('Nový e-mail').fill('jana.nova@example.cz');
    await page.getByLabel('Současné heslo').fill('wrong horse battery');
    await page.getByRole('button', { name: 'Poslat potvrzovací odkaz' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'Nesprávné současné heslo. Zadejte prosím heslo, kterým se teď přihlašujete.',
    );
    await expect(page.getByLabel('Nový e-mail')).toHaveValue('jana.nova@example.cz');
  });
});
