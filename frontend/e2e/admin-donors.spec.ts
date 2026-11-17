import { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readPdf } from '../src/app/features/donations/receipt-pdf/testing/pdf-reader';
import { expect, test } from './fixtures';
import {
  administrationCopyGift,
  administrator,
  bankAccountItem,
  donationItem,
  mockDonorApi,
  problem,
  serveAdministrationCopy,
  session,
} from './donor-session';
import {
  mockAdministrationReceiptReading,
  syntheticPortrait,
  syntheticSignature,
} from './receipt-issuing';
import { KEY_LIST, REVOKED_KEY_LIST, serveReceiptKeys } from './receipt-verification';

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
  yearlyReceiptsAvailableThrough: 2025,
  receiptsAvailableFrom: 2026,
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
      keyId: '21fe31df',
    },
  ],
};

const ENLARGED_TEXT_PX = [24, 28, 32, 53];

interface SeparatorPlace {
  sameLine: boolean;
  separatorLeft: number;
  separatorRight: number;
  numberRight: number;
  lineStart: number;
}

async function separatorPlace(account: Locator): Promise<SeparatorPlace> {
  return account.evaluate((host) => {
    const number = host.querySelector('.ui-figures')!.getBoundingClientRect();
    const separator = host.querySelector('.separator')!.getBoundingClientRect();
    const line = host.querySelector('.account')!.getBoundingClientRect();
    return {
      sameLine: separator.top < number.bottom && separator.bottom > number.top,
      separatorLeft: separator.left,
      separatorRight: separator.right,
      numberRight: number.right,
      lineStart: line.left,
    };
  });
}

async function placement(row: Locator, button: Locator): Promise<number[]> {
  const rowBox = (await row.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;
  return [rowBox.height, buttonBox.x, buttonBox.y, buttonBox.width].map((value) =>
    Math.round(value),
  );
}

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
    const detailsCard = page.getByRole('region', { name: 'Údaje' });
    const signInCard = page.getByRole('region', { name: 'Přihlášení' });
    const erasureCard = page.getByRole('region', { name: 'Výmaz osobních údajů (GDPR)' });
    await expect(page.getByRole('region', { name: 'Shrnutí dárce' })).toContainText('7310945528');
    await expect(detailsCard).toContainText('petr@example.cz');
    await expect(detailsCard).toContainText(/Role\s*dárce/);
    await expect(signInCard).toContainText(/Dvoufaktorové ověření\s*zapnuté/);
    const accountsCard = page.getByRole('region', { name: 'Bankovní účty' });
    await expect(accountsCard).toContainText('2900233333/2010');
    await expect(accountsCard).toContainText('2 dary');
    await expect(page.getByRole('region', { name: 'Dary' })).toContainText(
      'Celkem 2 dary za 800 Kč.',
    );
    await expect(page.getByRole('region', { name: 'Vystavená potvrzení' })).toContainText(
      '2026-000001',
    );

    await page
      .getByRole('navigation', { name: 'Části karty dárce' })
      .getByRole('link', { name: 'Přihlášení' })
      .click();
    await expect(signInCard).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/sprava/darci/${PETR_ID}$`));

    await signInCard.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }).click();
    await expect(signInCard.getByRole('button', { name: 'Ponechat' })).toBeFocused();
    await signInCard.getByRole('button', { name: 'Ponechat' }).click();
    await expect(
      signInCard.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }),
    ).toBeFocused();
    expect(calls).toEqual([]);
    await signInCard.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }).click();
    await signInCard.getByRole('button', { name: 'Ano, vypnout' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /\S/ }).filter({ hasNotText: 'Načítáme' }),
    ).toHaveText(
      'Dvoufaktorové ověření u Petr Svoboda je vypnuté a všechna přihlášení jsme ukončili. Dárce dostal e-mail; po přihlášení heslem si ho může zapnout znovu.',
    );
    await expect(signInCard).toContainText(/Dvoufaktorové ověření\s*vypnuté/);
    await expect(signInCard.getByRole('button')).toHaveCount(0);

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

    await erasureCard.getByRole('button', { name: 'Vymazat osobní údaje' }).click();
    const eraseDialog = page.getByRole('dialog', { name: 'Vymazat osobní údaje: Petr Svoboda' });
    await expect(eraseDialog).toContainText('Nevratný krok');
    await expect(eraseDialog.getByRole('button', { name: 'Zrušit' })).toBeFocused();
    await eraseDialog.getByRole('button', { name: 'Zrušit' }).click();
    await expect(eraseDialog).toBeHidden();
    await expect(erasureCard.getByRole('button', { name: 'Vymazat osobní údaje' })).toBeFocused();
    await erasureCard.getByRole('button', { name: 'Vymazat osobní údaje' }).click();
    await expect(eraseDialog.getByRole('button', { name: 'Vymazat osobní údaje' })).toBeDisabled();
    await eraseDialog.getByRole('checkbox', { name: /Dárce o výmaz požádal/ }).check();
    await eraseDialog.getByRole('button', { name: 'Vymazat osobní údaje' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /\S/ }).filter({ hasNotText: 'Načítáme' }),
    ).toHaveText(
      'Osobní údaje dárce jsme vymazali a na jeho dosavadní e-mail poslali potvrzení. Účet už nejde použít. Dary a vystavená potvrzení zůstávají kvůli účetnictví; potvrzení zůstávají beze změny, i se jménem a adresou.',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Vymazaný dárce' })).toBeVisible();
    await expect(page.getByRole('note')).toContainText(
      'Osobní údaje tohoto dárce jsme vymazali 23. 10. 2026 11:00.',
    );
    await expect(detailsCard).not.toContainText('erased.invalid');
    await expect(detailsCard).toContainText(/Adresa\s*vymazána/);
    await expect(erasureCard.getByRole('button')).toHaveCount(0);
    await expect(signInCard.getByRole('button')).toHaveCount(0);
    await expect(accountsCard).toContainText('Bankovní účty jsme s osobními údaji dárce smazali');
    await expect(page.getByRole('region', { name: 'Dary' })).toContainText(
      'Celkem 1 dar za 500 Kč.',
    );
    expect(calls).toEqual(['reset', 'disconnect', 'DELETE', 'erase']);

    await page.getByRole('link', { name: '← Dárci' }).click();
    await expect(page).toHaveURL(/\/sprava\/darci$/);
  });

  test('when they issue the receipt of one donation, then the button names the wait, the status line names the number and the card lists the new receipt', async ({
    page,
  }) => {
    const issued: unknown[] = [];
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (release = resolve));
    const newReceipt = {
      id: '019a1c00-0000-7000-8000-00000000f002',
      number: '2026-000002',
      kind: 'SINGLE',
      donationId: '0192f0f1-0000-7000-8000-000000000001',
      donationReceivedOn: '2026-10-12',
      year: null,
      issuedOn: '2026-10-20',
      issuedAt: '2026-10-20T08:00:00Z',
      locale: 'cs',
      active: true,
    };
    await page.route(
      (url) => url.pathname === PETR_ACCOUNT,
      (route) => route.fulfill({ json: petrAccount }),
    );
    await page.route(
      (url) => url.pathname === PETR_DONATIONS,
      (route) =>
        route.fulfill({
          json:
            issued.length === 0
              ? petrDetail
              : { ...petrDetail, receipts: [newReceipt, ...petrDetail.receipts] },
        }),
    );
    await page.route(
      (url) => url.pathname === `${PETR_DONATIONS}/receipts`,
      async (route) => {
        issued.push(route.request().postDataJSON());
        await answered;
        await route.fulfill({
          json: {
            id: newReceipt.id,
            donorId: PETR_ID,
            status: 'ACTIVE',
            kind: 'SINGLE',
            number: '2026-000002',
            donationId: newReceipt.donationId,
            year: null,
            issuedAt: newReceipt.issuedAt,
            supersededAt: null,
            donorErased: false,
            receipt: {
              number: '2026-000002',
              issuedOn: '2026-10-20',
              replaces: null,
              verification: { keyId: '21fe31df', qrText: 'https://nfnn.cz/overit#1' },
            },
          },
        });
      },
    );

    await page.goto(`/sprava/darci/${PETR_ID}`);
    const receiptsCard = page.getByRole('region', { name: 'Vystavená potvrzení' });
    const choice = receiptsCard.getByLabel('Potvrzení k vystavení');
    await expect(choice).toHaveValue(/dar-/);
    await choice.selectOption({ label: 'Dar z 12.\u00a010. 2026, 300\u00a0Kč' });
    await receiptsCard.getByRole('button', { name: 'Vystavit potvrzení' }).click();

    await expect(
      receiptsCard.getByRole('button', { name: 'Vystavujeme potvrzení…' }),
    ).toBeDisabled();
    release();
    await expect(receiptsCard.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Vystavili jsme potvrzení 2026-000002 z 20. 10. 2026 10:00. Je platné.',
    );
    await expect(receiptsCard.getByRole('row').filter({ hasText: '2026-000002' })).toContainText(
      'Dar z 12. 10. 2026',
    );
    expect(issued).toEqual([{ donationId: '0192f0f1-0000-7000-8000-000000000001' }]);
  });

  test('when they download a valid receipt from the donor card, then the PDF drawn in the browser is saved with the signature and portrait the receipt shows, and the row says where it is', async ({
    page,
  }) => {
    const receipt = petrDetail.receipts[0];
    await page.route(
      (url) => url.pathname === PETR_ACCOUNT,
      (route) => route.fulfill({ json: petrAccount }),
    );
    await page.route(
      (url) => url.pathname === PETR_DONATIONS,
      (route) => route.fulfill({ json: petrDetail }),
    );
    const asked = await mockAdministrationReceiptReading(
      page,
      { id: receipt.id, donationId: receipt.donationId, donorId: PETR_ID },
      { singleNumber: receipt.number, withArt: true },
    );
    await page.goto(`/sprava/darci/${PETR_ID}`);
    const row = page
      .getByRole('region', { name: 'Vystavená potvrzení' })
      .getByRole('row')
      .filter({ hasText: receipt.number });
    const download = row.getByRole('button', { name: `Stáhnout PDF potvrzení ${receipt.number}` });

    const [saved] = await Promise.all([page.waitForEvent('download'), download.click()]);

    expect(saved.suggestedFilename()).toBe(`potvrzeni-o-daru-${receipt.number}.pdf`);
    await expect(row.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      `Potvrzení potvrzeni-o-daru-${receipt.number}.pdf je stažené. Najdete ho ve stažených souborech.`,
    );
    await expect(download).toBeFocused();
    expect(asked).toEqual([
      `/api/admin/donations/receipts/${receipt.id}`,
      `/api/admin/donations/receipt-images/${syntheticSignature.sha256}`,
      `/api/admin/donations/receipt-images/${syntheticPortrait.sha256}`,
    ]);
    const pdf = await readPdf(new Uint8Array(await readFile(await saved.path())));
    expect(pdf.pages[0].text).toContain(receipt.number);
    expect(pdf.raw.match(/\/Subtype \/Image/g) ?? []).toHaveLength(1);
    expect(pdf.pages[0].links.map((link) => link.url)).toEqual([
      expect.stringMatching(/^https:\/\/nfnn\.cz\/overit#/),
    ]);
  });

  for (const { list, warned } of [
    { list: REVOKED_KEY_LIST, warned: true },
    { list: KEY_LIST, warned: false },
  ]) {
    test(`when the published key list names the key of a valid receipt ${warned ? 'withdrawn' : 'in force'}, then its row ${warned ? 'warns under the button what /overit shows' : 'shows no warning'}`, async ({
      page,
    }) => {
      const receipt = petrDetail.receipts[0];
      await page.route(
        (url) => url.pathname === PETR_ACCOUNT,
        (route) => route.fulfill({ json: petrAccount }),
      );
      await page.route(
        (url) => url.pathname === PETR_DONATIONS,
        (route) => route.fulfill({ json: petrDetail }),
      );
      await serveReceiptKeys(page, list);
      const keysRead = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/donations/receipt-keys',
      );
      await page.goto(`/sprava/darci/${PETR_ID}`);
      const row = page
        .getByRole('region', { name: 'Vystavená potvrzení' })
        .getByRole('row')
        .filter({ hasText: receipt.number });
      await expect(
        row.getByRole('button', { name: `Stáhnout PDF potvrzení ${receipt.number}` }),
      ).toBeVisible();
      await keysRead;
      const warning = row.getByText('QR na tomto potvrzení podepsal zneplatněný klíč.', {
        exact: false,
      });
      if (warned) {
        await expect(warning).toHaveText(
          'QR na tomto potvrzení podepsal zneplatněný klíč. Stránka /overit ho ukáže jako zneplatněné.',
        );
      } else {
        await expect(row).toContainText('platné');
        await expect(warning).toHaveCount(0);
      }
    });
  }

  test('when the PDF of a receipt takes long to prepare on a computer, then its row keeps its height, the button stays put, Zrušit comes before it and the state sits on the row axis', async ({
    page,
  }) => {
    const receipt = petrDetail.receipts[0];
    await page.route(
      (url) => url.pathname === PETR_ACCOUNT,
      (route) => route.fulfill({ json: petrAccount }),
    );
    await page.route(
      (url) => url.pathname === PETR_DONATIONS,
      (route) => route.fulfill({ json: petrDetail }),
    );
    await page.clock.install();
    await page.route(
      (url) => url.pathname === `/api/admin/donations/receipts/${receipt.id}`,
      () => new Promise<void>(() => undefined),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/sprava/darci/${PETR_ID}`);
    const row = page
      .getByRole('region', { name: 'Vystavená potvrzení' })
      .getByRole('row')
      .filter({ hasText: receipt.number });
    await expect(
      row.getByRole('button', { name: `Stáhnout PDF potvrzení ${receipt.number}` }),
    ).toBeVisible();
    const button = row.locator('.receipt-pdf');
    await row.scrollIntoViewIfNeeded();
    const resting = await placement(row, button);
    const pill = (await row.getByText('platné', { exact: true }).boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    expect(
      Math.abs(pill.y + pill.height / 2 - (buttonBox.y + buttonBox.height / 2)),
    ).toBeLessThanOrEqual(1);

    await button.click();
    await expect(row.getByRole('status')).toHaveText(/\S/);
    expect(await placement(row, button)).toEqual(resting);

    await page.clock.fastForward(8000);
    const cancel = row.getByRole('button', { name: 'Zrušit' });
    await expect(cancel).toBeVisible();
    expect(await placement(row, button)).toEqual(resting);
    const cancelBox = (await cancel.boundingBox())!;
    expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(buttonBox.x);

    await cancel.focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
  });

  test('when the card opens on a phone, then each fact of the summary keeps its label and value side by side in one row', async ({
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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sprava/darci/${PETR_ID}`);
    const summary = page.getByRole('region', { name: 'Shrnutí dárce' });
    await expect(summary).toContainText('Dvoufaktorové ověření');

    const rows = await summary.locator('dl > div').evaluateAll((items) =>
      items.map((item) => {
        const label = item.querySelector('dt')!.getBoundingClientRect();
        const value = item.querySelector('dd')!.getBoundingClientRect();
        return {
          label: item.querySelector('dt')!.textContent!.trim(),
          beside: value.left >= label.right && value.top < label.bottom && value.bottom > label.top,
        };
      }),
    );
    expect(rows.map((row) => row.label)).toEqual(['VS', 'E-mail', 'Dary', 'Dvoufaktorové ověření']);
    expect(rows.every((row) => row.beside)).toBe(true);
  });

  test('when the card opens on a computer, then the summary values share one baseline and the receipt dates stay on one line beside the PDF reserve', async ({
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
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/sprava/darci/${PETR_ID}`);
    const summary = page.getByRole('region', { name: 'Shrnutí dárce' });
    await expect(summary).toContainText('Dvoufaktorové ověření');

    const baselines = await summary.locator('dl > div > dd').evaluateAll((values) =>
      values.map((value) => {
        const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) =>
            node.textContent!.trim() === '' || node.parentElement!.closest('button')
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        });
        const range = document.createRange();
        range.selectNodeContents(walker.nextNode()!);
        return Math.round(range.getClientRects()[0].bottom);
      }),
    );
    expect(baselines).toHaveLength(4);
    expect(Math.max(...baselines) - Math.min(...baselines)).toBeLessThanOrEqual(1);

    const row = page
      .getByRole('region', { name: 'Vystavená potvrzení' })
      .getByRole('row')
      .filter({ hasText: petrDetail.receipts[0].number });
    const lines = async (cell: RegExp, selector: string | null) =>
      row.getByRole('cell', { name: cell }).evaluate((element, query) => {
        const range = document.createRange();
        range.selectNodeContents(query === null ? element : element.querySelector(query)!);
        return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
      }, selector);
    expect(await lines(/^Dar z 10\.\s10\.\s2026$/, null)).toBe(1);
    expect(await lines(/^17\.\s10\.\s2026\s11:00/, '.ui-date')).toBe(1);
  });

  test('when the card shows its actions on a computer, then every hint stands under its button and the two account actions stand side by side at one height', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === PETR_ACCOUNT,
      (route) => route.fulfill({ json: { ...petrAccount, passkeys: 1 } }),
    );
    await page.route(
      (url) => url.pathname === PETR_DONATIONS,
      (route) => route.fulfill({ json: petrDetail }),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/sprava/darci/${PETR_ID}`);

    for (const [card, name, hint] of [
      ['Přihlášení', 'Vypnout dvoufaktorové ověření', 'Pro dárce, který přišel o telefon'],
      [
        'Přihlášení',
        'Odebrat přístupové klíče',
        'Pro dárce, který přišel o zařízení s přístupovým klíčem.',
      ],
      ['Výmaz osobních údajů (GDPR)', 'Vymazat osobní údaje', 'Pro dárce, který požádal o výmaz'],
    ]) {
      const region = page.getByRole('region', { name: card });
      const buttonBox = (await region.getByRole('button', { name }).boundingBox())!;
      const hintBox = (await region.getByText(hint).boundingBox())!;
      expect(hintBox.y, name).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
      expect(Math.round(hintBox.x), name).toBe(Math.round(buttonBox.x));
    }

    const accounts = page.getByRole('region', { name: 'Bankovní účty' });
    const disconnect = (await accounts
      .getByRole('button', { name: /^Vypnout párování/ })
      .boundingBox())!;
    const remove = (await accounts.getByRole('button', { name: /^Odebrat účet/ }).boundingBox())!;
    expect(Math.round(remove.y)).toBe(Math.round(disconnect.y));
    expect(Math.round(remove.height)).toBe(Math.round(disconnect.height));
    expect(remove.x).toBeGreaterThanOrEqual(disconnect.x + disconnect.width);
  });

  test('when the text grows up to 200 % on a computer, then the separator before the bank never covers the account number and never starts a line, up to the largest system text', async ({
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
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/sprava/darci/${PETR_ID}/bankovni-ucty`);
    const account = page
      .getByRole('region', { name: 'Bankovní účty' })
      .locator('app-bank-account', { hasText: '2900233333/2010' });
    await expect(account).toContainText('Fio banka');

    let seenOnOneLine = false;
    for (const px of ENLARGED_TEXT_PX) {
      await page.addStyleTag({ content: `html { font-size: ${px}px; }` });
      const place = await separatorPlace(account);
      if (place.sameLine) {
        seenOnOneLine = true;
        expect(place.separatorLeft, `${px} px`).toBeGreaterThanOrEqual(place.numberRight);
      } else {
        expect(place.separatorRight, `${px} px`).toBeLessThanOrEqual(place.lineStart);
      }
    }
    expect(seenOnOneLine).toBe(true);
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

  test('when the copy on this device holds gifts, then before any search the donors who gave last are listed newest first and one opens the card', async ({
    page,
  }) => {
    await serveAdministrationCopy(page, {
      donations: {
        'donations:2026-09': [
          administrationCopyGift(
            '0192f0f1-0000-7000-8000-0000000000a1',
            janaAccount.donorId,
            '2026-09-20',
            20000,
          ),
        ],
        'donations:2026-10': [
          administrationCopyGift(
            '0192f0f1-0000-7000-8000-0000000000a2',
            PETR_ID,
            '2026-10-25',
            123450,
          ),
        ],
      },
      donors: { 'accounts:2026-10': [janaAccount, petrAccount] },
    });
    await page.route(
      (url) => url.pathname === PETR_ACCOUNT,
      (route) => route.fulfill({ json: petrAccount }),
    );
    await page.route(
      (url) => url.pathname === PETR_DONATIONS,
      (route) => route.fulfill({ json: petrDetail }),
    );

    await page.goto('/sprava/darci');

    await expect(page.getByRole('heading', { level: 3, name: 'Naposledy přispěli' })).toBeVisible();
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Petr Svoboda');
    await expect(rows.nth(0)).toContainText('1 234,50 Kč');
    await expect(rows.nth(0)).toContainText('25. 10. 2026');
    await expect(rows.nth(1)).toContainText('Jana Nováková');
    await expect(rows.nth(1)).toContainText('200 Kč');

    await rows.nth(0).getByRole('link', { name: 'Petr Svoboda' }).click();
    await expect(page).toHaveURL(new RegExp(`/sprava/darci/${PETR_ID}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Petr Svoboda' })).toBeFocused();
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
