import { bankAccountItem, mockDonorApi, openDonorSection, signIn } from './donor-session';
import { expect, test } from './fixtures';

test.describe('Given a donor whose account is at a bank the site does not name itself', () => {
  test('when the donor opens Bankovní účty, then the bank is named from the list the server keeps', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) =>
        route.fulfill({
          json: { items: [bankAccountItem({ accountNumber: '1234567890/4000' })] },
        }),
    );
    const bankCodes = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/donations/bank-codes',
    );
    await page.route(
      (url) => url.pathname === '/api/donations/bank-codes',
      (route) =>
        route.fulfill({
          json: {
            fetchedAt: '2026-11-09T04:40:00Z',
            items: [{ code: '4000', name: 'Max banka a.s.' }],
          },
        }),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');

    const account = page.locator('.account', { hasText: '1234567890/4000' });
    await expect(account.locator('.account-bank')).toHaveText('Max banka');
    expect((await bankCodes).headers()['authorization']).toMatch(/^Bearer /);
  });
});
