import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  FOUNDATION_PAYMENT_DETAILS,
  PAYMENT_QR_1000,
  PAYMENT_QR_500,
  drawnModulesMatch,
} from './qr-matrices';

const PAYMENT_DETAILS_PATH = '/api/donations/payment-details';

async function servePaymentDetails(page: Page, asked: string[]): Promise<void> {
  await page.route(
    (url) => url.pathname === PAYMENT_DETAILS_PATH,
    async (route) => {
      asked.push(new URL(route.request().url()).pathname);
      await route.fulfill({ json: FOUNDATION_PAYMENT_DETAILS });
    },
  );
}

test.describe('Given a visitor on the home page', () => {
  test('when they choose 1 000 Kč and back 500 Kč, then the browser draws each QR payment from one answer of payment details and never asks for a server QR', async ({
    page,
  }) => {
    const asked: string[] = [];
    await servePaymentDetails(page, asked);

    await page.goto('/');
    const qrCode = page.getByRole('img', { name: 'QR platba na účet Nadačního fondu Nová naděje' });
    await expect(qrCode).toBeVisible();
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_500)).toBe(true);

    await page.getByRole('button', { name: '1 000 Kč' }).click();
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_1000)).toBe(true);
    await page.getByRole('button', { name: '500 Kč' }).click();
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_500)).toBe(true);

    expect(PAYMENT_QR_1000.modules).not.toBe(PAYMENT_QR_500.modules);
    expect(asked).toEqual([PAYMENT_DETAILS_PATH]);
    await expect(page.locator('#prispet')).toContainText('CZ26 2010 0000 0055 4433 2217');
  });

  test('when they type an amount, then its QR payment is drawn and announced once they stop typing', async ({
    page,
  }) => {
    const asked: string[] = [];
    await servePaymentDetails(page, asked);
    await page.goto('/');
    const qrCode = page.getByRole('img', { name: 'QR platba na účet Nadačního fondu Nová naděje' });
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_500)).toBe(true);

    await page.getByRole('button', { name: 'Jiná částka' }).click();
    await page.locator('#donate-custom-amount').pressSequentially('1000');

    await expect(page.locator('#prispet .qr-image')).not.toHaveClass(/qr-image-stale/);
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_1000)).toBe(true);
    await expect(page.locator('#prispet .qr-announcement')).toHaveText(
      'QR platba na 1 000\u00a0Kč je připravená.',
    );
    expect(asked).toEqual([PAYMENT_DETAILS_PATH]);
  });

  test('when they save the QR code, then a PNG image of it downloads', async ({ page }) => {
    await servePaymentDetails(page, []);
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
    await expect(page.locator('#prispet').getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'QR kód qr-platba-nova-nadeje.png je uložený. Najdete ho ve stažených souborech.',
    );
  });

  test('when they Tab past the amounts, then the line before paying, the copy buttons and then the QR follow in the order they see', async ({
    page,
  }) => {
    await servePaymentDetails(page, []);
    await page.goto('/');
    await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');
    await page.getByRole('button', { name: 'Jiná částka' }).focus();

    const reached: string[] = [];
    for (let step = 0; step < 7; step += 1) {
      await page.keyboard.press('Tab');
      reached.push(
        await page.evaluate(
          () => document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        ),
      );
    }

    expect(reached).toEqual([
      'Založit účet',
      'Přihlásit se',
      'Kopírovat číslo účtu',
      'Kopírovat částku',
      'Kopírovat IBAN',
      'Uložit QR kód',
      expect.any(String),
    ]);
  });

  test.describe('on a phone', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    test('when they copy the amount, then the clipboard holds it and the bank details come before the QR code', async ({
      page,
    }) => {
      await servePaymentDetails(page, []);
      await page.goto('/');
      const bank = page.locator('#prispet .bank');
      await expect(bank).toContainText('5544332217/2010');

      await page.getByRole('button', { name: 'Jiná částka' }).click();
      await expect(page.locator('#donate-custom-amount')).toHaveValue('');
      await expect(page.locator('#prispet .qr-placeholder')).toHaveText('Nejprve zadejte částku');
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
