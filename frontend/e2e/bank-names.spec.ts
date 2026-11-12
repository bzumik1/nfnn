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

test.describe('Given a donor whose verified account has gifts without a symbol and a hint', () => {
  for (const width of [390, 1280]) {
    test(`when the donor opens Bankovní účty ${width} px wide, then the logo centres on the number and the lines under it, not on the hint`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) =>
          route.fulfill({
            json: {
              items: [
                bankAccountItem({
                  id: 'a-1',
                  accountNumber: '2000145399/0800',
                  verifiedOn: '2026-10-17',
                  donationCount: 1,
                  totalAmountMinor: 50000,
                }),
                bankAccountItem({
                  id: 'a-2',
                  accountNumber: '2000145399/9999',
                  status: 'AWAITING_PAYMENT',
                  verifiedOn: null,
                }),
              ],
            },
          }),
      );
      await mockBankLogos(page, [{ code: '0800', imageId: LOGO_IMAGE_ID }]);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Bankovní účty');
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);

      const verified = page.locator('.account', { hasText: '2000145399/0800' });
      await expect(verified.locator('.account-hint')).toBeVisible();
      await expect(verified.locator('.account-meta > li')).toContainText(['1 dar bez symbolu']);
      const line = (await verified.locator('.account-line').boundingBox())!;
      const meta = (await verified.locator('.account-meta-wrap').boundingBox())!;
      const logo = (await verified.locator('app-bank-logo').boundingBox())!;
      const blockCentre = (line.y + meta.y + meta.height) / 2;
      expect(Math.abs(logo.y + logo.height / 2 - blockCentre)).toBeLessThanOrEqual(1);

      const awaiting = page.locator('.account', { hasText: '2000145399/9999' });
      await expect(awaiting.locator('.account-meta-wrap')).toHaveCount(0);
      await expect(awaiting.locator('.account-hint')).toBeVisible();
      const onlyLine = (await awaiting.locator('.account-line').boundingBox())!;
      const mark = (await awaiting.locator('app-bank-logo').boundingBox())!;
      expect(
        Math.abs(mark.y + mark.height / 2 - (onlyLine.y + onlyLine.height / 2)),
      ).toBeLessThanOrEqual(1);
    });
  }
});
