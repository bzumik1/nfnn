import { bankAccountItem, mockDonorApi, openDonorSection, signIn } from './donor-session';
import { LOGO_IMAGE_ID, mockBankLogos } from './bank-logos';
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

test.describe('Given a donor whose accounts are at a bank with a logo and at one without', () => {
  test('when the donor opens Bankovní účty, then the first row starts with the logo from nfnn.cz and the second with the monogram of its bank', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) =>
        route.fulfill({
          json: {
            items: [
              bankAccountItem({ id: 'a-1', accountNumber: '2000145399/0800' }),
              bankAccountItem({ id: 'a-2', accountNumber: '2900233333/2010' }),
            ],
          },
        }),
    );
    const logos = await mockBankLogos(page, [{ code: '0800', imageId: LOGO_IMAGE_ID }]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');

    const withLogo = page.locator('.account', { hasText: '2000145399/0800' });
    const logo = withLogo.locator('app-bank-logo img');
    await expect(logo).toHaveAttribute('src', `/api/donations/bank-logos/images/${LOGO_IMAGE_ID}`);
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
    await expect(withLogo.locator('app-bank-mark')).toHaveAttribute('aria-hidden', 'true');

    const withMonogram = page.locator('.account', { hasText: '2900233333/2010' });
    await expect(withMonogram.locator('app-bank-logo img')).toHaveCount(0);
    await expect(withMonogram.locator('[data-monogram]')).toHaveAttribute('data-monogram', 'FB');
    await expect(withMonogram.locator('.account-number')).toHaveText('2900233333/2010');

    expect(logos.list).toHaveLength(1);
    expect(logos.list[0].headers()['authorization']).toBeUndefined();
  });
});
