import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, problem, session, signIn } from './donor-session';

const PAYMENTS = '/api/admin/donations/payments';
const DONORS = '/api/admin/donations/donors';
const PAYMENT_ID = '019a1c00-0000-7000-8000-000000001001';

const unpaired = {
  id: PAYMENT_ID,
  bankTransactionId: 1001,
  bookedOn: '2026-10-10',
  amountMinor: 50000,
  currency: 'CZK',
  variableSymbol: '1111111111',
  counterpartyAccount: '2900233333/2010',
  counterpartyName: 'Nováková Jana',
  messageForRecipient: 'Dar pro fond',
  importedAt: '2026-10-17T10:00:00Z',
  unpairedByAdminAt: null,
  accountVerification: false,
  donation: null,
};

const paired = {
  ...unpaired,
  donation: {
    id: 'd1',
    donorId: administrator.id,
    donorName: 'Jana Nováková',
    pairedBy: 'MANUAL',
    status: 'RECEIVED',
    recordedAt: '2026-10-18T09:00:00Z',
    receiptIssued: false,
  },
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator with an unpaired bank payment', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/admin/donations/import-state',
      (route) =>
        route.fulfill({
          json: {
            coveredFrom: '2026-07-20',
            coveredTo: '2026-10-17',
            lastAttemptedAt: '2026-10-18T08:05:30Z',
            lastSucceededAt: '2026-10-18T08:05:30Z',
            lastFailure: null,
            consecutiveFailures: 0,
            reportedOutage: null,
          },
        }),
    );
  });

  test('when they open the payments from the administration, search a donor and pair, then the list reloads and the success names both', async ({
    page,
  }) => {
    let pairedNow = false;
    const pairRequests: unknown[] = [];
    await page.route(
      (url) => url.pathname === PAYMENTS,
      (route) => {
        const pairing = new URL(route.request().url()).searchParams.get('pairing');
        if (pairing === 'paired') {
          return route.fulfill({
            json: { year: 2026, availableYears: [2026], items: pairedNow ? [paired] : [] },
          });
        }
        return route.fulfill({
          json: { year: null, availableYears: [], items: pairedNow ? [] : [unpaired] },
        });
      },
    );
    await page.route(
      (url) => url.pathname === DONORS,
      (route) => {
        const query = new URL(route.request().url()).searchParams.get('query');
        return route.fulfill({
          json: {
            items:
              query === 'nov'
                ? [
                    {
                      donorId: administrator.id,
                      name: 'Jana Nováková',
                      type: 'PERSON',
                      variableSymbol: '4821937560',
                      companyIdentifier: null,
                    },
                  ]
                : [],
          },
        });
      },
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donors',
      (route) =>
        route.fulfill({
          json: {
            items: [{ donorId: administrator.id, email: 'jana.novakova@example.cz' }],
            hasMore: false,
          },
        }),
    );
    await page.route(
      (url) => url.pathname === `${PAYMENTS}/${PAYMENT_ID}/pair`,
      (route) => {
        pairRequests.push(route.request().postDataJSON());
        pairedNow = true;
        return route.fulfill({ json: { donationId: 'd1', changedYearlyReceipts: [2026] } });
      },
    );
    await signIn(page, administrator);
    await page.getByRole('link', { name: 'Správa' }).click();

    await page.getByRole('link', { name: 'Platby z banky' }).click();

    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await expect(page).toHaveTitle('Platby z banky | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeFocused();
    const row = page.locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('10. 10. 2026');
    await expect(row).toContainText('500 Kč');
    await expect(row).toContainText('Nováková Jana');
    await expect(row).toContainText('1111111111');

    await page.getByRole('button', { name: 'Přiřadit dárci' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByLabel('Hledat dárce podle jména nebo variabilního symbolu'),
    ).toBeFocused();
    await expect(dialog.getByRole('searchbox')).toHaveValue('Nováková');
    await expect(dialog.getByRole('button', { name: 'Přiřadit', exact: true })).toBeDisabled();

    await page.getByRole('dialog').getByRole('searchbox').fill('nov');
    await expect(dialog.getByRole('radio', { name: /Jana Nováková/ })).toBeVisible();
    await expect(dialog.locator('.pair-result')).toContainText('jana.novakova@example.cz');
    await dialog.getByRole('radio', { name: /Jana Nováková/ }).check();
    const submit = dialog.getByRole('button', { name: 'Přiřadit dárci Jana Nováková' });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: /\S/ }).filter({ hasNotText: 'Načítáme' }),
    ).toHaveText(
      'Platba 500 Kč z 10. 10. 2026 je přiřazena dárci Jana Nováková. Dárce si už stáhl roční potvrzení za 2026; při dalším stažení dostane nové. Dejte mu prosím vědět.',
    );
    await expect(page.locator('.ui-card__empty')).toContainText(
      'Všechny platby z banky jsou přiřazené.',
    );
    expect(pairRequests).toEqual([{ donorId: administrator.id }]);

    await page.getByRole('button', { name: 'Přiřazené', exact: true }).click();

    await expect(page.locator('tbody tr')).toContainText('Jana Nováková');
    await expect(page.locator('tbody tr')).toContainText('ručně správcem');
  });

  test('when they unpair a paired payment, then a confirmation precedes the request and the payment is marked as held', async ({
    page,
  }) => {
    let unpairedNow = false;
    await page.route(
      (url) => url.pathname === PAYMENTS,
      (route) => {
        const pairing = new URL(route.request().url()).searchParams.get('pairing');
        if (pairing === 'paired') {
          return route.fulfill({
            json: { year: 2026, availableYears: [2026, 2025], items: unpairedNow ? [] : [paired] },
          });
        }
        return route.fulfill({
          json: {
            year: null,
            availableYears: [],
            items: unpairedNow ? [{ ...unpaired, unpairedByAdminAt: '2026-10-18T10:00:00Z' }] : [],
          },
        });
      },
    );
    await page.route(
      (url) => url.pathname === `${PAYMENTS}/${PAYMENT_ID}/unpair`,
      (route) => {
        unpairedNow = true;
        return route.fulfill({ json: { changedYearlyReceipts: [] } });
      },
    );
    await rememberedSession(page);
    await page.goto('/sprava/platby');
    await page.getByRole('button', { name: 'Přiřazené', exact: true }).click();
    await expect(page.locator('tbody tr')).toContainText('Jana Nováková');
    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene$/);

    await page.getByRole('button', { name: 'Zrušit přiřazení' }).click();
    const question = page.getByRole('group', { name: /Zrušit přiřazení platby/ });
    await expect(question).toContainText('zmizí z přehledu dárce Jana Nováková');
    await expect(question.getByRole('button', { name: 'Ponechat' })).toBeFocused();
    await question.getByRole('button', { name: 'Ponechat' }).click();
    await expect(question).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zrušit přiřazení' })).toBeFocused();
    await page.getByRole('button', { name: 'Zrušit přiřazení' }).click();
    await question.getByRole('button', { name: 'Zrušit přiřazení' }).click();

    await expect(
      page.getByRole('status').filter({ hasText: /\S/ }).filter({ hasNotText: 'Načítáme' }),
    ).toContainText('už není přiřazena');
    await expect(page.locator('.ui-card__empty')).toHaveText('Zatím není přiřazena žádná platba.');

    await page.getByRole('button', { name: /^Čekají na přiřazení/ }).click();

    await expect(page.locator('tbody tr')).toContainText('jen ručně');
  });

  test('when the payment was paired by someone else in the meantime, then the dialog shows the reason and stays open', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === PAYMENTS,
      (route) => route.fulfill({ json: { year: null, availableYears: [], items: [unpaired] } }),
    );
    await page.route(
      (url) => url.pathname === DONORS,
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                donorId: administrator.id,
                name: 'Jana Nováková',
                type: 'PERSON',
                variableSymbol: '4821937560',
                companyIdentifier: null,
              },
            ],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === `${PAYMENTS}/${PAYMENT_ID}/pair`,
      (route) =>
        route.fulfill(
          problem(
            409,
            'donations/bank-payment-already-paired',
            'Platba už je přiřazená',
            'Obnovte prosím seznam.',
          ),
        ),
    );
    await rememberedSession(page);
    await page.goto('/sprava/platby');
    await page.getByRole('button', { name: 'Přiřadit dárci' }).click();
    const dialog = page.getByRole('dialog');
    await page.getByRole('dialog').getByRole('searchbox').fill('jana');
    await dialog.getByRole('radio', { name: /Jana Nováková/ }).check();

    await dialog.getByRole('button', { name: 'Přiřadit dárci Jana Nováková' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'Platba už je přiřazená. Obnovte prosím seznam.',
    );
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Přiřadit dárci' })).toBeFocused();
  });
});

test.describe('Given an administrator with many paired payments', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they search, load the next page and open a donor, then Back returns to the same search', async ({
    page,
  }) => {
    const requests: string[] = [];
    await page.route(
      (url) => url.pathname === PAYMENTS,
      (route) => {
        const params = new URL(route.request().url()).searchParams;
        requests.push(params.toString());
        if (params.get('pairing') !== 'paired') {
          return route.fulfill({ json: { year: null, availableYears: [], items: [], total: 0 } });
        }
        const offset = Number(params.get('offset') ?? '0');
        const total = params.get('query') === 'nov' ? 51 : 120;
        const items = Array.from({ length: Math.min(50, total - offset) }, (_, index) => ({
          ...paired,
          id: `019a1c00-0000-7000-8000-${String(offset + index).padStart(12, '0')}`,
          bankTransactionId: 2000 + offset + index,
        }));
        return route.fulfill({ json: { year: null, availableYears: [2026], items, total } });
      },
    );
    await rememberedSession(page);
    await page.goto('/sprava/platby');
    await page.getByRole('button', { name: 'Přiřazené', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(50);
    await expect(page.getByText('Zobrazeno 50 z 120.')).toBeVisible();

    await page.getByRole('searchbox', { name: 'Hledat', exact: true }).fill('nov');

    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene&q=nov$/);
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Nalezeno 51 plateb.',
    );
    await page.getByRole('button', { name: 'Načíst další' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(51);
    await expect(page.locator('tbody tr').nth(50)).toBeFocused();
    await expect(page.getByRole('button', { name: 'Načíst další' })).toHaveCount(0);
    expect(requests).toContain('pairing=paired&query=nov&offset=50&limit=50');

    await page.locator('tbody tr').first().getByRole('link', { name: 'Jana Nováková' }).click();
    await expect(page).toHaveURL(/\/sprava\/darci\//);
    await page.goBack();

    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene&q=nov$/);
    await expect(page.getByRole('searchbox', { name: 'Hledat', exact: true })).toHaveValue('nov');
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Nalezeno 51 plateb.',
    );
  });
});

test.describe('Given an administrator with a 1 Kč account verification waiting for a donor', () => {
  test('when they open the payments and the pairing dialog, then both say it is an account verification', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === PAYMENTS,
      (route) =>
        route.fulfill({
          json: {
            year: null,
            availableYears: [],
            total: 1,
            items: [
              {
                ...unpaired,
                amountMinor: 100,
                variableSymbol: null,
                counterpartyName: 'Marková Lucie',
                messageForRecipient: 'Ověření účtu Nadační fond Nová naděje',
                accountVerification: true,
              },
            ],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === DONORS,
      (route) => route.fulfill({ json: { items: [] } }),
    );
    await rememberedSession(page);

    await page.goto('/sprava/platby');

    await expect(page.locator('tbody tr')).toContainText('1 Kč Ověření účtu');
    await page.getByRole('button', { name: 'Přiřadit dárci' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Touto platbou si dárce ověřuje bankovní účet.');
  });
});
