import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  FOUNDATION_PAYMENT_DETAILS,
  PAYMENT_QR_1000,
  PAYMENT_QR_500,
  drawnModulesMatch,
  paymentSpayd,
} from './qr-matrices';

const PAYMENT_QR_500_SPAYD = paymentSpayd('500 Kč without a variable symbol');
const PAYMENT_QR_1000_SPAYD = paymentSpayd('1 000 Kč without a variable symbol');

const PAYMENT_DETAILS_PATH = '/api/donations/payment-details';
const QR_NAME = 'QR platba na účet Nadačního fondu Nová naděje';
const PHONE_LAYOUT_MAX_WIDTH = 899;

function phoneLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) <= PHONE_LAYOUT_MAX_WIDTH;
}

async function showQr(page: Page): Promise<void> {
  if (phoneLayout(page)) {
    await page.getByRole('button', { name: /Platíte z jiného zařízení\?/ }).click();
  }
}

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
    await showQr(page);
    const qrCode = page.getByRole('img', { name: QR_NAME });
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
    await showQr(page);
    const qrCode = page.getByRole('img', { name: QR_NAME });
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
    await showQr(page);
    await expect(page.getByRole('img', { name: QR_NAME })).toBeVisible();

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

    const expected = phoneLayout(page)
      ? [
          'Založit účet',
          'Přihlásit se',
          'Kopírovat číslo účtu',
          'Kopírovat částku',
          'Kopírovat IBAN',
          'založíte účet',
          'Otevřít v aplikaci banky',
          'Uložit QR kód',
          'Platíte z jiného zařízení? Zobrazit QR kód ke skenování',
        ]
      : [
          'Založit účet',
          'Přihlásit se',
          'Kopírovat číslo účtu',
          'Kopírovat částku',
          'Kopírovat IBAN',
          'založíte účet',
          'Uložit QR kód',
        ];
    const reached: string[] = [];
    while (reached.length < expected.length) {
      await page.keyboard.press('Tab');
      reached.push(
        await page.evaluate(
          () => document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        ),
      );
    }

    expect(reached).toEqual(expected);
  });

  test('when they enter their own amount, open the privacy policy and come back to Přispět, then the same amount stays chosen in the field, the bank details and the QR', async ({
    page,
  }) => {
    await servePaymentDetails(page, []);
    await page.goto('/');
    await page.getByRole('button', { name: 'Jiná částka' }).click();
    await page.getByLabel('Vlastní částka v korunách').fill('300');
    await expect(page.locator('#prispet .bank')).toContainText('300 Kč');

    await page
      .locator('footer')
      .getByRole('link', { name: 'Zásady ochrany osobních údajů' })
      .click();
    await expect(page).toHaveURL(/zasady-ochrany-osobnich-udaju/);
    await page.locator('footer').getByRole('link', { name: 'Přispět' }).click();

    await expect(page.getByRole('button', { name: 'Jiná částka' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('Vlastní částka v korunách')).toHaveValue('300');
    await expect(page.locator('#prispet .bank')).toContainText('300 Kč');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('when the bank details show, then the QR code waits folded under them until the visitor pays from another device', async ({
      page,
    }) => {
      await servePaymentDetails(page, []);
      await page.goto('/');
      const bank = page.locator('#prispet .bank');
      await expect(bank).toContainText('5544332217/2010');
      const otherDevice = page.getByRole('button', { name: /Platíte z jiného zařízení\?/ });
      await expect(otherDevice).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('img', { name: QR_NAME })).toBeHidden();
      await expect(page.locator('#prispet .bank-app').getByRole('status')).toHaveCount(2);

      await otherDevice.click();

      await expect(page.getByRole('img', { name: QR_NAME })).toBeVisible();
      await expect(page.locator('#prispet .qr-caption')).toHaveText(
        'QR platba na účet Nadačního fondu Nová naděje, 500\u00a0Kč.',
      );
      const bankTop = (await bank.boundingBox())!.y;
      const qrTop = (await page.locator('#prispet .qr').boundingBox())!.y;
      expect(bankTop).toBeLessThan(qrTop);
    });

    test('when the payment details failed and the visitor retries, then the focus waits on the bank buttons and then rests on Otevřít v aplikaci banky', async ({
      page,
    }) => {
      let answers = 0;
      await page.route(
        (url) => url.pathname === PAYMENT_DETAILS_PATH,
        async (route) => {
          answers += 1;
          await (answers === 1
            ? route.fulfill({ status: 503, json: { title: 'Nedostupné' } })
            : route.fulfill({ json: FOUNDATION_PAYMENT_DETAILS }));
        },
      );
      await page.goto('/');
      const retry = page.locator('#prispet').getByRole('button', { name: 'Zkusit znovu' });

      await retry.click();

      await expect(page.getByRole('button', { name: 'Otevřít v aplikaci banky' })).toBeFocused();
    });

    test('when the browser cannot hand the payment file to an app, then Otevřít v aplikaci banky downloads platba.spayd with the payment of the chosen amount', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
      });
      await servePaymentDetails(page, []);
      await page.goto('/');
      await page.getByRole('button', { name: '1 000 Kč' }).click();

      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Otevřít v aplikaci banky' }).click();

      const saved = await download;
      expect(saved.suggestedFilename()).toBe('platba.spayd');
      const stream = await saved.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      expect(Buffer.concat(chunks).toString('utf8')).toBe(PAYMENT_QR_1000_SPAYD);
      await expect(
        page.locator('#prispet').getByRole('status').filter({ hasText: /\S/ }),
      ).toContainText('Soubor platba.spayd je ve stažených souborech.');
    });

    test.describe('on a phone that shares files', () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
          const offered: { name: string; type: string; text: string; title?: string }[] = [];
          Object.defineProperty(window, 'offeredFiles', { value: offered });
          Object.defineProperty(navigator, 'canShare', {
            value: (data: ShareData) => (data.files ?? []).length > 0,
            configurable: true,
          });
          Object.defineProperty(navigator, 'share', {
            value: async (data: ShareData) => {
              for (const file of data.files ?? []) {
                offered.push({
                  name: file.name,
                  type: file.type,
                  text: file.type.startsWith('image/') ? '' : await file.text(),
                  title: data.title,
                });
              }
              throw new DOMException('Share canceled', 'AbortError');
            },
            configurable: true,
          });
        });
      });

      test('when the visitor taps Otevřít v aplikaci banky and closes the offer, then the phone was offered platba.spayd and the page says how to pay without the bank app', async ({
        page,
      }) => {
        await servePaymentDetails(page, []);
        await page.goto('/');
        await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');

        await page.getByRole('button', { name: 'Otevřít v aplikaci banky' }).click();

        await expect(
          page.locator('#prispet').getByRole('status').filter({ hasText: /\S/ }),
        ).toHaveText(
          'Neotevřela se vám banka? Zkopírujte údaje výše do bankovní aplikace, nebo pošlete QR jako obrázek a v bance zvolte platbu z obrázku.',
        );
        expect(
          await page.evaluate(() => (window as unknown as { offeredFiles: unknown }).offeredFiles),
        ).toEqual([
          {
            name: 'platba.spayd',
            type: 'application/x-shortpaymentdescriptor',
            text: PAYMENT_QR_500_SPAYD,
            title: 'QR platba',
          },
        ]);
      });

      test('when the visitor taps Poslat QR jako obrázek, then the phone is offered the PNG of the QR', async ({
        page,
      }) => {
        await servePaymentDetails(page, []);
        await page.goto('/');
        await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');

        await page.getByRole('button', { name: 'Poslat QR jako obrázek' }).click();

        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as { offeredFiles: unknown[] }).offeredFiles.length,
            ),
          )
          .toBe(1);
        expect(
          await page.evaluate(() => (window as unknown as { offeredFiles: unknown }).offeredFiles),
        ).toEqual([
          { name: 'qr-platba-nova-nadeje.png', type: 'image/png', text: '', title: 'QR platba' },
        ]);
      });
    });

    test.describe('with the clipboard allowed', () => {
      test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
      test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'Only Chromium grants the clipboard permissions; the device checklist copies on the iPhone',
      );

      test('when they copy the amount, then the clipboard holds it and the bank details come before the QR code', async ({
        page,
      }) => {
        await servePaymentDetails(page, []);
        await page.goto('/');
        const bank = page.locator('#prispet .bank');
        await expect(bank).toContainText('5544332217/2010');

        await page.getByRole('button', { name: 'Jiná částka' }).click();
        await expect(page.locator('#donate-custom-amount')).toHaveValue('');
        await showQr(page);
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
});
