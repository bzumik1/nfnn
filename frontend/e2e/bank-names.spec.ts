import type { Locator } from '@playwright/test';
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

const SYSTEM_DEFAULT_TEXT_PX = 17;
const LARGEST_SYSTEM_TEXT_PX = 53;

test.describe('Given a donor with one account that has gifts without a symbol and one that has none', () => {
  for (const rootPx of [null, SYSTEM_DEFAULT_TEXT_PX, LARGEST_SYSTEM_TEXT_PX]) {
    const textSize = rootPx ? `with a root of ${rootPx} px` : 'at the default text size';
    test(`when the donor opens Bankovní účty 390 px wide ${textSize}, then both logos sit at the same place against the account number`, async ({
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
                  accountNumber: '6020809023/0800',
                  verifiedOn: '2026-10-18',
                  donationCount: 1,
                  totalAmountMinor: 200,
                }),
                bankAccountItem({
                  id: 'a-2',
                  accountNumber: '123-7092740277/0100',
                  verifiedOn: '2026-10-18',
                }),
              ],
            },
          }),
      );
      await mockBankLogos(page, [
        { code: '0800', imageId: LOGO_IMAGE_ID },
        { code: '0100', imageId: LOGO_IMAGE_ID },
      ]);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Bankovní účty');
      await page.setViewportSize({ width: 390, height: 900 });
      if (rootPx) {
        await page.addStyleTag({ content: `html { font-size: ${rootPx}px; }` });
      }
      await page.evaluate(() => document.fonts.ready);

      const withGifts = page.locator('.account', { hasText: '6020809023/0800' });
      const withoutGifts = page.locator('.account', { hasText: '123-7092740277/0100' });
      await expect(withGifts.locator('.account-meta > li')).toContainText(['1 dar bez symbolu']);
      await expect(withoutGifts.locator('.account-meta > li')).toHaveCount(2);

      const offsetOf = async (account: Locator) => {
        const logo = (await account.locator('app-bank-logo').boundingBox())!;
        const number = (await account.locator('.account-number').boundingBox())!;
        const meta = (await account.locator('.account-meta-wrap').boundingBox())!;
        const status = (await account.locator('.account-status').boundingBox())!;
        return { logo, number, meta, status, offset: logo.y - number.y };
      };
      const first = await offsetOf(withGifts);
      const second = await offsetOf(withoutGifts);

      expect(first.meta.height).toBeGreaterThan(second.meta.height + 1);
      if (rootPx === SYSTEM_DEFAULT_TEXT_PX) {
        expect(first.status.y).toBeGreaterThanOrEqual(first.number.y + first.number.height);
        expect(second.status.y).toBeGreaterThanOrEqual(second.number.y + second.number.height);
      }
      expect(Math.abs(first.offset - second.offset)).toBeLessThanOrEqual(1);
      for (const { logo, number } of [first, second]) {
        const beside = logo.x + logo.width <= number.x;
        const above = logo.y + logo.height <= number.y;
        expect(beside || above).toBe(true);
      }
    });
  }
});
