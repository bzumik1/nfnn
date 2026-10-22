import { expect, test } from '@playwright/test';
import { mockDonorApi, signIn } from './donor-session';

const newAccount = {
  id: '0192f0c4-0000-7000-8000-000000000002',
  accountNumber: '1234567890/0800',
  status: 'ACTIVE',
  verifiedOn: '2026-10-18',
  connectedFrom: null,
  disconnectedOn: null,
  donationCount: 0,
  totalAmountMinor: 0,
  currency: 'CZK',
  lastDonationOn: null,
  shared: false,
  pairingExcluded: false,
};

test.describe('Given a signed-in donor adding a bank account', () => {
  test('when the verification payment arrives while the dialog is open, then the waiting turns into a tick', async ({
    page,
  }) => {
    await page.clock.install();
    await mockDonorApi(page);
    let dialogOpen = false;
    let paymentBooked = false;
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-check',
      (route) => {
        if (route.request().method() === 'POST' && dialogOpen) {
          paymentBooked = true;
        }
        return route.fulfill({
          status: 202,
          json: { bankDataAsOf: '2026-10-18T08:05:30Z', checking: false },
        });
      },
    );
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) => route.fulfill({ json: { items: paymentBooked ? [newAccount] : [] } }),
    );
    await signIn(page);

    await page.getByRole('button', { name: 'Přidat účet' }).click();
    dialogOpen = true;
    const dialog = page.getByRole('dialog');
    const watch = dialog.locator('.add-account-watch');
    await expect(watch).toHaveAttribute('role', 'status');
    await expect(watch).toContainText('Čekáme na vaši platbu…');

    await page.clock.fastForward(30_000);

    await expect(watch).toContainText('Účet 1234567890/0800 je ověřený');
    await expect(page.locator('.accounts-list .account-number')).toHaveText('1234567890/0800');
  });
});
