import { expect, Locator, Page, test } from '@playwright/test';
import { PAYMENT_QR_1000, PAYMENT_QR_500, QrMatrixFixture } from './qr-matrices';

const QR_FOR_AMOUNT: Record<string, QrMatrixFixture> = {
  '500': PAYMENT_QR_500,
  '1000': PAYMENT_QR_1000,
};

async function drawnModulesMatch(qrCode: Locator, matrix: QrMatrixFixture): Promise<boolean> {
  return qrCode.evaluate((svg, { size, modules }) => {
    const dots = Array.from(svg.querySelectorAll('circle.qr-dot'));
    return (
      dots.length > 0 &&
      dots.every((dot) => {
        const column = Number(dot.getAttribute('cx')) - 4.5;
        const row = Number(dot.getAttribute('cy')) - 4.5;
        const dark = modules[row * size + column] === '1';
        return dark !== dot.classList.contains('is-off');
      })
    );
  }, matrix);
}

async function servePaymentQr(page: Page, requestedAmounts: string[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/donations/payment-qr',
    async (route) => {
      const amount = new URL(route.request().url()).searchParams.get('amount') ?? '';
      requestedAmounts.push(amount);
      await route.fulfill({
        json: {
          spayd: `SPD*1.0*ACC:CZ2620100000005544332217*AM:${amount}.00*CC:CZK`,
          qrCode: QR_FOR_AMOUNT[amount] ?? PAYMENT_QR_500,
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
  test('when they choose 1 000 Kč, then its prefetched QR payment is drawn without asking the server again', async ({
    page,
  }) => {
    const requestedAmounts: string[] = [];
    await servePaymentQr(page, requestedAmounts);

    await page.goto('/');
    const qrCode = page.getByRole('img', { name: 'QR platba na účet Nadačního fondu Nová naděje' });
    await expect(qrCode).toBeVisible();
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_500)).toBe(true);
    await expect.poll(() => requestedAmounts.length).toBe(3);

    await page.getByRole('button', { name: '1 000 Kč' }).click();

    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_1000)).toBe(true);
    expect(requestedAmounts).toEqual(['500', '1000', '100']);
    await expect(page.locator('#prispet')).toContainText('CZ26 2010 0000 0055 4433 2217');
  });

  test('when they save the QR code, then a PNG image of it downloads', async ({ page }) => {
    await servePaymentQr(page, []);
    await page.goto('/');
    await expect(
      page.getByRole('img', { name: 'QR platba na účet Nadačního fondu Nová naděje' }),
    ).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Uložit QR kód' }).click();

    const saved = await download;
    expect(saved.suggestedFilename()).toBe('qr-platba-nova-nadeje.png');
    const stream = await saved.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  test.describe('on a phone', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    test('when they copy the amount, then the clipboard holds it and the bank details come before the QR code', async ({
      page,
    }) => {
      await servePaymentQr(page, []);
      await page.goto('/');
      const bank = page.locator('#prispet .bank');
      await expect(bank).toContainText('5544332217/2010');

      await page.getByRole('button', { name: 'Jiná částka' }).click();
      await page.locator('#donate-custom-amount').fill('2 500');
      await expect(bank).toContainText('2 500 Kč');
      await page.getByRole('button', { name: 'Kopírovat částku' }).click();

      await expect(page.getByRole('button', { name: 'Zkopírováno' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('2500');
      const bankTop = (await bank.boundingBox())!.y;
      const qrTop = (await page.locator('#prispet .qr').boundingBox())!.y;
      expect(bankTop).toBeLessThan(qrTop);
    });
  });
});
