import { expect, Page, test } from '@playwright/test';

const QR_FOR_AMOUNT: Record<string, string> = {
  '500': 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
  '1000': 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOQktKDIwbiOACeNAYhsqv//AAAAABJRU5ErkJggg==',
};

async function servePaymentQr(page: Page, requestedAmounts: string[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/donations/payment-qr',
    async (route) => {
      const amount = new URL(route.request().url()).searchParams.get('amount') ?? '';
      requestedAmounts.push(amount);
      await route.fulfill({
        json: {
          spayd: `SPD*1.0*ACC:CZ2620100000005544332217*AM:${amount}.00*CC:CZK`,
          qrPngBase64: QR_FOR_AMOUNT[amount] ?? QR_FOR_AMOUNT['500'],
          bankAccount: {
            accountNumber: '5544332217/2010',
            iban: 'CZ2620100000005544332217',
            recipientName: 'Nadační fond Nová naděje',
          },
        },
      });
    },
  );
}

test.describe('Given a visitor on the home page', () => {
  test('when they choose 1 000 Kč, then the site asks for a QR payment of 1000 and shows its QR code', async ({ page }) => {
    const requestedAmounts: string[] = [];
    await servePaymentQr(page, requestedAmounts);

    await page.goto('/');
    const qrCode = page.getByRole('img', { name: 'QR platba na účet Nadačního fondu Nová naděje' });
    await expect(qrCode).toHaveAttribute('src', `data:image/png;base64,${QR_FOR_AMOUNT['500']}`);

    await page.getByRole('button', { name: '1 000 Kč' }).click();

    await expect(qrCode).toHaveAttribute('src', `data:image/png;base64,${QR_FOR_AMOUNT['1000']}`);
    expect(await qrCode.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(requestedAmounts).toEqual(['500', '1000']);
    await expect(page.locator('#donate')).toContainText('CZ26 2010 0000 0055 4433 2217');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });

    test('when they copy the amount, then the clipboard holds it and the bank details come before the QR code', async ({ page }) => {
      await servePaymentQr(page, []);
      await page.goto('/');
      const bank = page.locator('#donate .bank');
      await expect(bank).toContainText('5544332217/2010');

      await page.getByRole('button', { name: 'Jiná částka' }).click();
      await page.locator('#donate-custom-amount').fill('2 500');
      await expect(bank).toContainText('2 500 Kč');
      await page.getByRole('button', { name: 'Kopírovat částku' }).click();

      await expect(page.getByRole('button', { name: 'Zkopírováno' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('2500');
      const bankTop = (await bank.boundingBox())!.y;
      const qrTop = (await page.locator('#donate .qr').boundingBox())!.y;
      expect(bankTop).toBeLessThan(qrTop);
    });
  });
});

