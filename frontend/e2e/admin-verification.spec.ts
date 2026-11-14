import { Page } from '@playwright/test';
import { mockAdministrationCopy } from './administration-copy';
import { administrator, mockDonorApi, session } from './donor-session';
import { expect, test } from './fixtures';
import {
  keyList,
  scanFragment,
  serveReceiptApi,
  verdictHeading,
  YEARLY_RECEIPT,
} from './receipt-verification';

const YEARLY_ROW = {
  id: '01980000-0000-7000-8000-000000000123',
  donorId: '01980000-0000-7000-8000-00000000d001',
  status: 'ACTIVE',
  kind: 'YEARLY',
  number: '2027-000123',
  donationId: null,
  year: 2026,
  issuedOn: '2027-01-15',
  issuedAt: '2027-01-15T09:00:00Z',
  supersededAt: null,
  withdrawnAt: null,
  withdrawalReason: null,
  locale: 'cs',
  giftCount: 12,
  totalAmountMinor: 840_100,
};

async function administratorOn(page: Page, receipts: readonly object[]): Promise<void> {
  await mockDonorApi(page);
  await mockAdministrationCopy(page, { donations: [{ id: 'receipts:2026', rows: receipts }] });
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

function register(page: Page) {
  return page.getByRole('region', { name: 'V evidenci fondu' });
}

const REPLACED_ROWS = [
  { ...YEARLY_ROW, status: 'REPLACED', supersededAt: '2027-02-01T10:00:00Z' },
  {
    ...YEARLY_ROW,
    id: '01980000-0000-7000-8000-000000000124',
    number: '2027-000124',
    issuedOn: '2027-02-01',
    issuedAt: '2027-02-01T10:00:00Z',
  },
];

test.describe('Given an administrator whose device holds the administration copy', () => {
  test('when they verify a yearly receipt the fund has replaced, then right under the verdict the copy adds the day, the newer number and the donor card', async ({
    page,
  }) => {
    await administratorOn(page, REPLACED_ROWS);
    await serveReceiptApi(page, { keys: keyList(), status: 'replaced' });

    await page.goto('/sprava/overit');
    await expect(page).toHaveTitle('Ověřit potvrzení | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Ověřit potvrzení' })).toBeFocused();
    await expect(page.getByText('Fond ověřuje potvrzení jen na adrese')).toHaveCount(0);

    await scanFragment(page, YEARLY_RECEIPT.fragment);

    await expect(verdictHeading(page)).toHaveText('Fond toto potvrzení nahradil novějším');
    await expect(page.getByText('Platí to novější; najdete ho na kartě dárce.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'info@nfnn.cz' })).toHaveCount(0);
    await expect(register(page)).toContainText('Nahrazené');
    await expect(register(page)).toContainText(
      'Fond ho 1. 2. 2027 nahradil potvrzením č. 2027-000124.',
    );
    await expect(register(page)).toContainText(
      /Podle údajů správy stažených do tohoto zařízení [1-9]\d?\. [1-9]\d?\. \d{4} v [1-9]?\d:\d{2}\./,
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Údaje v kódu' })).toBeVisible();
    expect(
      await register(page).evaluate((section) => {
        const data = document.querySelector('.verify-data');
        return data !== null && Boolean(section.compareDocumentPosition(data) & 4);
      }),
    ).toBe(true);
    await register(page).getByRole('link', { name: 'Otevřít kartu dárce' }).click();
    await expect(page).toHaveURL(`/sprava/darci/${YEARLY_ROW.donorId}`);
  });

  test('when they verify a replaced receipt while offline, then the status points to the copy, which says it was replaced and what counts', async ({
    page,
    context,
  }) => {
    await administratorOn(page, REPLACED_ROWS);
    await serveReceiptApi(page, { keys: keyList(), status: 'replaced' });
    await page.goto('/sprava/overit');
    await scanFragment(page, YEARLY_RECEIPT.fragment);
    await expect(register(page)).toContainText('Nahrazené');
    await page.getByRole('button', { name: 'Ověřit další potvrzení' }).click();

    await context.setOffline(true);
    await page
      .getByLabel('Odkaz z QR kódu')
      .fill(`https://nfnn.cz/overit#${YEARLY_RECEIPT.fragment}`);
    await page.getByRole('button', { name: 'Ověřit odkaz' }).click();

    await expect(verdictHeading(page)).toHaveText('Podepsáno fondem Nová naděje');
    await expect(page.getByText('Bez připojení se fondu nezeptáme.')).toBeVisible();
    await expect(register(page)).toContainText('Nahrazené');
    await expect(register(page)).toContainText('Platí to novější; najdete ho na kartě dárce.');
  });

  test('when the fund answers that it replaced a receipt the copy still holds as valid, then the copy is shown as older and never as valid', async ({
    page,
  }) => {
    await administratorOn(page, [YEARLY_ROW]);
    await serveReceiptApi(page, { keys: keyList(), status: 'replaced' });

    await page.goto('/sprava/overit');
    await scanFragment(page, YEARLY_RECEIPT.fragment);

    await expect(verdictHeading(page)).toHaveText('Fond toto potvrzení nahradil novějším');
    await expect(register(page)).toContainText('Starší údaje');
    await expect(register(page)).toContainText('Platí odpověď fondu.');
    await expect(register(page)).not.toContainText('Platné');
  });

  test('when the fund keeps the receipt as valid but the copy holds no receipt of that number, then the copy says it misses it, the answer counts, and links no donor', async ({
    page,
  }) => {
    await administratorOn(page, []);
    await serveReceiptApi(page, { keys: keyList(), status: 'active' });

    await page.goto('/sprava/overit');
    await scanFragment(page, YEARLY_RECEIPT.fragment);

    await expect(page.getByText('Fond toto potvrzení vede jako platné.')).toBeVisible();
    await expect(register(page)).toContainText('Nenalezeno');
    await expect(register(page)).toContainText('Platí odpověď fondu.');
    await expect(register(page).getByRole('link')).toHaveCount(0);
  });
});

test.describe('Given a visitor on the public verification page', () => {
  test('when they verify a receipt, then the page shows no register of the fund', async ({
    page,
  }) => {
    await serveReceiptApi(page, { keys: keyList(), status: 'active' });

    await page.goto('/overit');
    await scanFragment(page, YEARLY_RECEIPT.fragment);

    await expect(verdictHeading(page)).toHaveText('Podepsáno fondem Nová naděje');
    await expect(page.getByText('V evidenci fondu')).toHaveCount(0);
    await expect(page.getByText('Fond ověřuje potvrzení jen na adrese')).toBeVisible();
  });
});
