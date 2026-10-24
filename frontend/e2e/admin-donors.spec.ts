import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  administrator,
  bankAccountItem,
  donationItem,
  mockDonorApi,
  problem,
  session,
} from './donor-session';

const PETR_ID = '019a1c00-0000-7000-8000-00000000a002';
const LINK_ID = '0192f0c4-0000-7000-8000-000000000001';
const DONORS = '/api/admin/donors';
const PETR_ACCOUNT = `${DONORS}/${PETR_ID}`;
const PETR_DONATIONS = `/api/admin/donations/donors/${PETR_ID}`;
const PETR_LINK = `${PETR_DONATIONS}/bank-accounts/${LINK_ID}`;

const janaAccount = {
  donorId: administrator.id,
  type: 'PERSON',
  name: 'Jana Nováková',
  companyIdentifier: null,
  address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
  email: 'jana@example.cz',
  variableSymbol: '1234567890',
  preferredLocale: 'cs',
  registeredAt: '2026-10-17T10:00:00Z',
  emailVerified: true,
  administrator: true,
  secondFactorEnabled: true,
  passkeys: 0,
  erasedAt: null as string | null,
};

const petrAccount = {
  ...janaAccount,
  donorId: PETR_ID,
  name: 'Petr Svoboda',
  email: 'petr@example.cz',
  variableSymbol: '7310945528',
  administrator: false,
  secondFactorEnabled: true,
};

const petrDetail = {
  donor: {
    donorId: PETR_ID,
    name: 'Petr Svoboda',
    type: 'PERSON',
    variableSymbol: '7310945528',
    companyIdentifier: null,
    address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
    preferredLocale: 'cs',
    registeredAt: '2026-10-17T10:00:00Z',
    erasedAt: null as string | null,
  },
  bankAccounts: [
    bankAccountItem({
      id: LINK_ID,
      donationCount: 2,
      totalAmountMinor: 50000,
      lastDonationOn: '2026-10-12',
    }),
  ],
  donations: {
    items: [
      donationItem({
        id: '0192f0f1-0000-7000-8000-000000000001',
        receivedAt: '2026-10-12',
        amountMinor: 30000,
        pairedBy: 'SENDER_ACCOUNT',
        senderAccount: '2900233333/2010',
      }),
      donationItem({
        id: '0192f0f1-0000-7000-8000-000000000002',
        receivedAt: '2026-10-10',
        amountMinor: 50000,
        receiptNumber: '2026-000001',
      }),
    ],
    totalAmountMinor: 80000,
    currency: 'CZK',
    count: 2,
  },
  receipts: [
    {
      id: '019a1c00-0000-7000-8000-00000000f001',
      number: '2026-000001',
      kind: 'SINGLE',
      donationId: '0192f0f1-0000-7000-8000-000000000002',
      donationReceivedOn: '2026-10-10',
      year: null,
      issuedOn: '2026-10-17',
      issuedAt: '2026-10-17T09:00:00Z',
      locale: 'cs',
      active: true,
    },
  ],
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator on the donors page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they search, open a donor, turn the second factor off and manage an account, then each step asks, posts and reports', async ({
    page,
  }) => {
    const queries: string[] = [];
    const calls: string[] = [];
    let account = petrAccount;
    let detail = petrDetail;
    await page.route(
      (url) => url.pathname === DONORS,
      (route) => {
        const query = new URL(route.request().url()).searchParams.get('query') ?? '';
        queries.push(query);
        const items = query.toLowerCase().startsWith('sv')
          ? [petrAccount]
          : [janaAccount, petrAccount];
        return route.fulfill({ json: { items } });
      },
    );
    await page.route(
      (url) => url.pathname === PETR_ACCOUNT,
      (route) => {
        if (route.request().method() === 'DELETE') {
          calls.push('erase');
          account = {
            ...petrAccount,
            name: 'Vymazaný dárce',
            email: `erased-${PETR_ID}@erased.invalid`,
            address: { street: 'Vymazáno', city: 'Vymazáno', postalCode: '00000' },
            emailVerified: false,
            secondFactorEnabled: false,
            erasedAt: '2026-10-23T09:00:00Z',
          };
          detail = {
            ...detail,
            donor: { ...detail.donor, name: 'Vymazaný dárce', erasedAt: '2026-10-23T09:00:00Z' },
            bankAccounts: [],
          };
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ json: account });
      },
    );
    await page.route(
      (url) => url.pathname === PETR_DONATIONS,
      (route) => route.fulfill({ json: detail }),
    );
    await page.route(
      (url) => url.pathname === `${PETR_ACCOUNT}/second-factor/reset`,
      (route) => {
        calls.push('reset');
        account = { ...petrAccount, secondFactorEnabled: false };
        return route.fulfill({ status: 204 });
      },
    );
    await page.route(
      (url) => url.pathname === `${PETR_LINK}/disconnect`,
      (route) => {
        calls.push('disconnect');
        detail = {
          ...petrDetail,
          bankAccounts: [
            bankAccountItem({
              id: LINK_ID,
              status: 'DISCONNECTED',
              disconnectedOn: '2026-10-22',
              donationCount: 2,
              totalAmountMinor: 50000,
              lastDonationOn: '2026-10-12',
            }),
          ],
        };
        return route.fulfill({ status: 204 });
      },
    );
    await page.route(
      (url) => url.pathname === PETR_LINK,
      (route) => {
        calls.push(route.request().method());
        detail = {
          ...petrDetail,
          bankAccounts: [],
          donations: {
            items: [petrDetail.donations.items[1]],
            totalAmountMinor: 50000,
            currency: 'CZK',
            count: 1,
          },
        };
        return route.fulfill({ status: 204 });
      },
    );

    await page.goto('/sprava');
    await page.getByRole('link', { name: /^Dárci/ }).click();
    await expect(page).toHaveTitle('Dárci | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Dárci' })).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('Začněte psát a dárci se objeví tady.');

    await page.getByLabel('Jméno, e-mail nebo variabilní symbol').fill('svob');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    expect(queries).toEqual(['svob']);
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('Petr Svoboda');
    await expect(row).toContainText('petr@example.cz');
    await expect(row).toContainText('7310945528');
    await expect(row).toContainText('Dvoufaktorové ověření');
    await expect(row).not.toContainText('Správce');
    await expect(page).toHaveURL(/\/sprava\/darci\?q=svob$/);

    await row.getByRole('link', { name: 'Petr Svoboda' }).click();
    await expect(page).toHaveURL(new RegExp(`/sprava/darci/${PETR_ID}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Petr Svoboda' })).toBeFocused();
    const accountCard = page.getByRole('region', { name: 'Účet dárce' });
    await expect(accountCard).toContainText('petr@example.cz');
    await expect(accountCard).toContainText(/Role\s*dárce/);
    await expect(accountCard).toContainText(/Dvoufaktorové ověření\s*zapnuté/);
    const accountsCard = page.getByRole('region', { name: 'Bankovní účty' });
    await expect(accountsCard).toContainText('2900233333/2010');
    await expect(accountsCard).toContainText('2 dary');
    await expect(page.getByRole('region', { name: 'Dary' })).toContainText(
      'Celkem 2 dary za 800 Kč.',
    );
    await expect(page.getByRole('region', { name: 'Vydaná potvrzení' })).toContainText(
      '2026-000001',
    );

    await accountCard.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }).click();
    await expect(accountCard.getByRole('button', { name: 'Ponechat' })).toBeFocused();
    await accountCard.getByRole('button', { name: 'Ponechat' }).click();
    await expect(
      accountCard.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }),
    ).toBeFocused();
    expect(calls).toEqual([]);
    await accountCard.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }).click();
    await accountCard.getByRole('button', { name: 'Ano, vypnout' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /\S/ }).filter({ hasNotText: 'Načítáme' }),
    ).toHaveText(
      'Dvoufaktorové ověření u Petr Svoboda je vypnuté a všechna přihlášení jsme ukončili. Dárce dostal e-mail; po přihlášení heslem si ho může zapnout znovu.',
    );
    await expect(accountCard).toContainText(/Dvoufaktorové ověření\s*vypnuté/);
    await expect(accountCard.getByRole('button')).toHaveText(['Vymazat osobní údaje']);

    await accountsCard.getByRole('button', { name: 'Vypnout párování' }).click();
    await accountsCard.getByRole('button', { name: 'Ano, vypnout' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /\S/ }).filter({ hasNotText: 'Načítáme' }),
    ).toHaveText(
      'Párování z účtu 2900233333/2010 je vypnuté: platby bez symbolu z něj už dárci nepřiřadíme, dosavadní dary zůstávají.',
    );
    await expect(accountsCard).toContainText('Párování vypnuté');
    await expect(accountsCard.getByRole('button', { name: 'Zapnout párování' })).toBeVisible();

    await accountsCard.getByRole('button', { name: 'Odebrat účet' }).click();
    await expect(accountsCard).toContainText(
      'Smažeme 2 dary přiřazené přes tento účet i odpovědi o starších symbolech; platby zůstanou nespárované. Odebrat?',
    );
    await accountsCard.getByRole('button', { name: 'Ano, odebrat' }).click();
    const accountsResult = accountsCard.getByRole('status').filter({ hasNotText: 'Načítáme' });
    await expect(accountsResult).toHaveText(
      'Účet 2900233333/2010 jsme dárci odebrali: 2 dary přiřazené přes něj jsme smazali a platby jsou zase nespárované.',
    );
    await expect(accountsCard.locator('app-live-notice')).toBeFocused();
    await expect(accountsCard).toContainText('Z žádného účtu zatím nepřišla platba');
    await expect(page.getByRole('region', { name: 'Dary' })).toContainText(
      'Celkem 1 dar za 500 Kč.',
    );
    expect(calls).toEqual(['reset', 'disconnect', 'DELETE']);

    await accountCard.getByRole('button', { name: 'Vymazat osobní údaje' }).click();
    await expect(page.getByRole('group', { name: 'Vymazat osobní údaje?' })).toContainText(
      'Nevratný krok',
    );
    await accountCard.getByRole('button', { name: 'Ponechat' }).click();
    await accountCard.getByRole('button', { name: 'Vymazat osobní údaje' }).click();
    await accountCard.getByRole('button', { name: 'Ano, vymazat' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /\S/ }).filter({ hasNotText: 'Načítáme' }),
    ).toHaveText(
      'Osobní údaje dárce jsme vymazali a na jeho dosavadní e-mail poslali potvrzení. Účet už nejde použít; dary a vydaná potvrzení zůstávají bez jména.',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Vymazaný dárce' })).toBeVisible();
    await expect(page.getByRole('note')).toContainText(
      'Osobní údaje tohoto dárce jsme vymazali 23. 10. 2026 11:00.',
    );
    await expect(accountCard).not.toContainText('erased.invalid');
    await expect(accountCard).toContainText(/Adresa\s*vymazána/);
    await expect(accountCard.getByRole('button')).toHaveCount(0);
    await expect(accountsCard).toContainText('Bankovní účty jsme s osobními údaji dárce smazali');
    await expect(page.getByRole('region', { name: 'Dary' })).toContainText(
      'Celkem 1 dar za 500 Kč.',
    );
    expect(calls).toEqual(['reset', 'disconnect', 'DELETE', 'erase']);

    await page.getByRole('link', { name: '← Dárci' }).click();
    await expect(page).toHaveURL(/\/sprava\/darci$/);
  });

  test('when removing an account is refused because of a receipt, then the alert shows the reason and the account stays', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === PETR_ACCOUNT,
      (route) => route.fulfill({ json: petrAccount }),
    );
    await page.route(
      (url) => url.pathname === PETR_DONATIONS,
      (route) => route.fulfill({ json: petrDetail }),
    );
    await page.route(
      (url) => url.pathname === PETR_LINK,
      (route) =>
        route.fulfill(
          problem(
            409,
            'donations/bank-account-has-receipt',
            'Na dary z tohoto účtu odkazuje vydané potvrzení',
            'Účet nejde odebrat, dokud potvrzení platí.',
          ),
        ),
    );

    await page.goto(`/sprava/darci/${PETR_ID}`);
    const accountsCard = page.getByRole('region', { name: 'Bankovní účty' });
    await accountsCard.getByRole('button', { name: 'Odebrat účet' }).click();
    await accountsCard.getByRole('button', { name: 'Ano, odebrat' }).click();

    await expect(accountsCard.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Na dary z tohoto účtu odkazuje vydané potvrzení. Účet nejde odebrat, dokud potvrzení platí. Dary s potvrzením musí zůstat. Aby se dárci další platby z účtu nepřiřazovaly, vypněte u něj párování.',
    );
    await expect(accountsCard).toContainText('2900233333/2010');
    await expect(accountsCard.getByRole('button', { name: 'Odebrat účet' })).toBeFocused();
  });

  test('when the donor does not exist, then one card says so and leads back to the search', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === PETR_ACCOUNT,
      (route) => route.fulfill(problem(404, 'donors/donor-not-found', 'Dárce nenalezen', 'Není.')),
    );
    await page.route(
      (url) => url.pathname === PETR_DONATIONS,
      (route) =>
        route.fulfill(problem(404, 'donations/donor-not-found', 'Dárce nenalezen', 'Není.')),
    );

    await page.goto(`/sprava/darci/${PETR_ID}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Dárce' })).toBeFocused();
    const alerts = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alerts).toHaveCount(1);
    await expect(alerts).toContainText('Takový dárce není.');
    await alerts.getByRole('link', { name: 'Zpět na hledání dárců' }).click();
    await expect(page).toHaveURL(/\/sprava\/darci$/);
  });
});
