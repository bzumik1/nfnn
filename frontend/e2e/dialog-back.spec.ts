import { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, session } from './donor-session';

const PAYMENTS = '/api/admin/donations/payments';
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

async function openPayments(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
  await page.goto('/sprava/platby');
  await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeVisible();
}

interface Probe {
  dialogEntries: number;
  pops: number;
}

async function countDialogEntries(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = window as unknown as { dialogEntries: number; pops: number };
    record.dialogEntries = 0;
    record.pops = 0;
    window.addEventListener('popstate', () => record.pops++, { capture: true });
    const pushState = history.pushState.bind(history);
    history.pushState = (state: unknown, title: string, url?: string | URL | null) => {
      if (typeof state === 'object' && state !== null && 'nfnnDialogDepth' in state) {
        record.dialogEntries++;
      }
      pushState(state, title, url);
    };
  });
}

function dialogEntries(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as Probe).dialogEntries);
}

async function entryTakenBack(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (history.state as Record<string, unknown>)['nfnnDialogDepth']))
    .toBeUndefined();
}

async function back(page: Page): Promise<void> {
  await page.evaluate(() => history.back());
}

async function openPairing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Přiřadit dárci' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Given an administrator with the pairing dialog of a payment open', () => {
  let pairing: Route[];

  test.beforeEach(async ({ page }) => {
    pairing = [];
    let pairedNow = false;
    await countDialogEntries(page);
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === PAYMENTS,
      (route) =>
        route.fulfill({
          json: { year: null, availableYears: [], items: pairedNow ? [] : [unpaired] },
        }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/donations/donors',
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
      (url) => url.pathname === '/api/admin/donors',
      (route) => route.fulfill({ json: { items: [], hasMore: false } }),
    );
    await page.route(
      (url) => url.pathname === `${PAYMENTS}/${PAYMENT_ID}/pair`,
      (route) => {
        pairedNow = true;
        pairing.push(route);
      },
    );
    await openPayments(page);
    await openPairing(page);
  });

  test('when they go back, then the dialog closes and the payments stay on screen', async ({
    page,
  }) => {
    await back(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await expect(page.locator('tbody tr')).toContainText('Nováková Jana');
  });

  test('when they close it with its button and go back, then the page before the payments opens', async ({
    page,
  }) => {
    await page.getByRole('dialog').getByLabel('Zavřít').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await entryTakenBack(page);

    await back(page);

    await expect(page).toHaveURL(/\/$/);
  });

  test('when they go back while the pairing is being saved, then the dialog stays until it is done and Back then leaves the payments', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox').fill('nov');
    await dialog.getByRole('radio', { name: /Jana Nováková/ }).check();
    await dialog.getByRole('button', { name: 'Přiřadit dárci Jana Nováková' }).click();
    await expect.poll(() => pairing.length).toBe(1);
    const entries = await dialogEntries(page);

    await back(page);

    await expect.poll(() => dialogEntries(page)).toBe(entries + 1);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await pairing[0].fulfill({ json: { donationId: 'd1', changedYearlyReceipts: [] } });
    await expect(dialog).toHaveCount(0);
    await entryTakenBack(page);
    await back(page);
    await expect(page).toHaveURL(/\/$/);
  });

  test('when they reload the page with the dialog open, then one Back leaves the payments', async ({
    page,
  }) => {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as Probe).pops)).toBe(1);
    await entryTakenBack(page);

    await back(page);

    await expect(page).toHaveURL(/\/$/);
  });

  test('when they close it, go forward again and open it once more, then Back still closes it', async ({
    page,
  }) => {
    await page.getByRole('dialog').getByLabel('Zavřít').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await entryTakenBack(page);
    await page.evaluate(() => history.forward());
    await expect
      .poll(() =>
        page.evaluate(() => (history.state as Record<string, unknown>)['nfnnDialogDepth']),
      )
      .toBe(1);
    await openPairing(page);

    await back(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await back(page);
    await expect(page).toHaveURL(/\/$/);
  });
});
