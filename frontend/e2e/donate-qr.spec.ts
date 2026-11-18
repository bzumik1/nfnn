import { Page } from '@playwright/test';
import jsQR from 'jsqr';
import { expect, test } from './fixtures';
import { waitWhileNothingMayHappen } from './fixed-waits';
import { openSection } from './donor-session';
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
const DETAILS_FAILED =
  'Platební údaje se nepodařilo načíst. Zkuste to prosím znovu. Když to nepomůže, napište na info@nfnn.cz.';

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

async function decodedQrText(page: Page, png: Buffer): Promise<string | undefined> {
  const { width, height, rgba } = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: image.width, height: image.height, rgba: Array.from(image.data) };
  }, png.toString('base64'));
  return jsQR(Uint8ClampedArray.from(rgba), width, height, { inversionAttempts: 'dontInvert' })
    ?.data;
}

interface QrSwap {
  amountAt: number | null;
  shownAt: number | null;
}

type QrSwapWindow = Window & { qrSwap?: QrSwap };

async function watchQrSwap(page: Page, amount: string): Promise<void> {
  await page.evaluate((expected) => {
    const swap: QrSwap = { amountAt: null, shownAt: null };
    (window as QrSwapWindow).qrSwap = swap;
    const frame = (): void => {
      const now = performance.now();
      const shown = document
        .querySelector('#prispet .bank-row-amount .bank-value')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim();
      if (swap.amountAt === null && shown === expected) {
        swap.amountAt = now;
      }
      const drawn = document.querySelector('#prispet app-qr-code.qr-image-swapped');
      if (
        drawn !== null &&
        !drawn.classList.contains('qr-image-stale') &&
        Number(getComputedStyle(drawn).opacity) >= 0.999
      ) {
        swap.shownAt = now;
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, amount);
}

async function qrSwap(page: Page): Promise<QrSwap> {
  return page.evaluate(() => ({ ...(window as QrSwapWindow).qrSwap! }));
}

async function tokenMilliseconds(page: Page, token: string): Promise<number> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
  }, token);
}

async function cardHeight(page: Page): Promise<number> {
  return (await page.locator('#prispet .bank').boundingBox())!.height;
}

async function enlargedText(page: Page, percent: number): Promise<void> {
  await page.addInitScript((scale) => {
    const style = document.createElement('style');
    style.textContent = `html { font-size: ${scale}%; }`;
    document.addEventListener('DOMContentLoaded', () => document.head.append(style));
  }, percent);
}

test.describe('Given a visitor on the Přispět page', () => {
  test('when they choose 1 000 Kč and back 500 Kč, then the browser draws each QR payment from one answer of payment details and never asks for a server QR', async ({
    page,
  }) => {
    const asked: string[] = [];
    await servePaymentDetails(page, asked);

    await page.goto('/prispet');
    await showQr(page);
    const qrCode = page.getByRole('img', { name: QR_NAME });
    await expect(qrCode).toBeVisible();
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_500)).toBe(true);

    await page.getByRole('radio', { name: '1 000 Kč' }).click();
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_1000)).toBe(true);
    await page.getByRole('radio', { name: '500 Kč' }).click();
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
    await page.goto('/prispet');
    await showQr(page);
    const qrCode = page.getByRole('img', { name: QR_NAME });
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_500)).toBe(true);

    await page.getByRole('radio', { name: 'Jiná částka' }).click();
    await page.locator('#donate-custom-amount').pressSequentially('1000');

    await expect(page.locator('#prispet .qr-image')).not.toHaveClass(/qr-image-stale/);
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_1000)).toBe(true);
    await expect(page.locator('#prispet .qr-announcement')).toHaveText(
      'QR platba na 1 000\u00a0Kč je připravená.',
    );
    expect(asked).toEqual([PAYMENT_DETAILS_PATH]);
  });

  test('when they choose another amount, then the page shows the new QR in full within --duration-page of Částka showing it, and that QR reads as the new payment', async ({
    page,
  }) => {
    await servePaymentDetails(page, []);
    await page.goto('/prispet');
    await showQr(page);
    const qrCode = page.getByRole('img', { name: QR_NAME });
    await expect.poll(() => drawnModulesMatch(qrCode, PAYMENT_QR_500)).toBe(true);
    const budget = await tokenMilliseconds(page, '--duration-page');
    await watchQrSwap(page, '1 000 Kč');

    await page.getByRole('radio', { name: '1 000 Kč' }).click();

    await expect.poll(() => qrSwap(page).then((swap) => swap.shownAt !== null)).toBe(true);
    const swap = await qrSwap(page);
    expect(swap.amountAt).not.toBeNull();
    expect(swap.shownAt! - swap.amountAt!).toBeLessThanOrEqual(budget);
    expect(await drawnModulesMatch(qrCode, PAYMENT_QR_1000)).toBe(true);
    const picture = await page
      .locator('#prispet app-qr-code')
      .screenshot({ animations: 'disabled', scale: 'css' });
    expect(await decodedQrText(page, picture)).toBe(PAYMENT_QR_1000_SPAYD);
  });

  test('when the payment details fail, then the card says so with the address to write to, and an amount chosen meanwhile loads nothing until Zkusit znovu, which says the QR is ready', async ({
    page,
  }) => {
    test.skip(
      phoneLayout(page),
      'The phone keeps the QR folded; its failure is covered on a phone below',
    );
    const asked: string[] = [];
    await page.route(
      (url) => url.pathname === PAYMENT_DETAILS_PATH,
      async (route) => {
        asked.push(route.request().url());
        await (asked.length === 1
          ? route.fulfill({ status: 503, json: { title: 'Nedostupné' } })
          : route.fulfill({ json: FOUNDATION_PAYMENT_DETAILS }));
      },
    );
    await page.goto('/prispet');
    const alert = page.locator('#prispet .bank').getByRole('alert');
    await expect(alert).toHaveText(DETAILS_FAILED);
    await expect(alert.getByRole('link', { name: 'info@nfnn.cz' })).toHaveAttribute(
      'href',
      'mailto:info@nfnn.cz',
    );
    await expect(page.locator('#prispet app-qr-code')).toHaveCount(0);
    await expect(page.locator('#prispet .qr-code')).toBeHidden();
    await expect(page.locator('#prispet')).not.toContainText('Naskenujte a přispějte');
    const failedHeight = await cardHeight(page);

    await page.getByRole('radio', { name: '1 000 Kč' }).click();
    await expect(page.getByRole('radio', { name: '1 000 Kč' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await waitWhileNothingMayHappen(page, 1000);
    expect(asked).toHaveLength(1);

    await page.locator('#prispet').getByRole('button', { name: 'Zkusit znovu' }).click();

    await expect(page.locator('#prispet .qr-announcement')).toHaveText(
      'QR platba na 1 000\u00a0Kč je připravená.',
    );
    await expect(page.locator('#prispet .bank-row-amount .bank-value')).toHaveText('1 000\u00a0Kč');
    expect(Math.abs((await cardHeight(page)) - failedHeight)).toBeLessThanOrEqual(1);
  });

  test('when the payment details come slowly, then the card stands as its skeleton at the size of the finished card', async ({
    page,
  }) => {
    test.skip(
      phoneLayout(page),
      'On a phone the IBAN wraps by its own length, which the skeleton cannot know before the details come',
    );
    let release: () => void = () => undefined;
    const answer = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === PAYMENT_DETAILS_PATH,
      async (route) => {
        await answer;
        await route.fulfill({ json: FOUNDATION_PAYMENT_DETAILS });
      },
    );
    await page.goto('/prispet');
    await expect(page.locator('#prispet .bank-skeleton.is-shown')).toBeVisible();
    await expect(page.locator('#prispet .bank').getByRole('status')).toHaveText(
      'Připravujeme QR kód…',
    );
    const loadingHeight = await cardHeight(page);

    release();

    await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');
    expect(Math.abs((await cardHeight(page)) - loadingHeight)).toBeLessThanOrEqual(1);
  });

  test('when they save the QR code, then a PNG image of it downloads', async ({ page }) => {
    await servePaymentDetails(page, []);
    await page.goto('/prispet');
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
    const png = Buffer.concat(chunks);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(await decodedQrText(page, png)).toBe(PAYMENT_QR_500_SPAYD);
    await expect(page.locator('#prispet').getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'QR kód qr-platba-nova-nadeje.png je uložený. Najdete ho ve stažených souborech.',
    );
  });

  test('when they Tab past the amounts, then the line before paying, the copy buttons and then the QR follow in the order they see', async ({
    page,
  }) => {
    await servePaymentDetails(page, []);
    await page.goto('/prispet');
    await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');
    await page.getByRole('radio', { name: 'Jiná částka' }).focus();

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
          'Zvětšit: QR platba na účet Nadačního fondu Nová naděje',
          'Uložit QR kód',
          'založíte účet',
        ];
    const reached: string[] = [];
    while (reached.length < expected.length) {
      await page.keyboard.press('Tab');
      reached.push(
        await page.evaluate(
          () =>
            document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ||
            document.activeElement?.getAttribute('aria-label') ||
            '',
        ),
      );
    }

    expect(reached).toEqual(expected);
  });

  test('when they enter their own amount, open the privacy policy and come back to Přispět, then the same amount stays chosen in the field, the bank details and the QR', async ({
    page,
  }) => {
    await servePaymentDetails(page, []);
    await page.goto('/prispet');
    await page.getByRole('radio', { name: 'Jiná částka' }).click();
    await page.getByLabel('Vlastní částka v korunách').fill('300');
    await expect(page.locator('#prispet .bank')).toContainText('300 Kč');

    await page
      .locator('#prispet .donate-privacy')
      .getByRole('link', { name: 'zásady ochrany osobních údajů' })
      .click();
    await expect(page).toHaveURL(/zasady-ochrany-osobnich-udaju/);
    await openSection(page, 'Přispět');

    await expect(page.getByRole('radio', { name: 'Jiná částka' })).toHaveAttribute(
      'aria-checked',
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
      await page.goto('/prispet');
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

    test('when the payment details failed and the visitor retries, then the focus stays on Zkusit znovu and then rests on Otevřít v aplikaci banky', async ({
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
      await page.goto('/prispet');
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
      await page.goto('/prispet');
      await page.getByRole('radio', { name: '1 000 Kč' }).click();

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
        page.locator('#prispet .bank-app').getByRole('status').filter({ hasText: /\S/ }),
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

      test('when the visitor taps Otevřít v aplikaci banky and closes the offer, then the phone was offered the PNG of the QR and the page says how to save it for the bank app', async ({
        page,
      }) => {
        await servePaymentDetails(page, []);
        await page.goto('/prispet');
        await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');

        await page.getByRole('button', { name: 'Otevřít v aplikaci banky' }).click();

        await expect(
          page.locator('#prispet .bank-app').getByRole('status').filter({ hasText: /\S/ }),
        ).toHaveText(
          'Nenašli jste v nabídce svou banku? Klepněte znovu, zvolte Uložit obrázek a v bankovní aplikaci načtěte QR platbu z Fotek. Nebo zkopírujte údaje výše do bankovní aplikace.',
        );
        expect(
          await page.evaluate(() => (window as unknown as { offeredFiles: unknown }).offeredFiles),
        ).toEqual([
          {
            name: 'QR platba Nová naděje 500 Kč.png',
            type: 'image/png',
            text: '',
            title: 'QR platba',
          },
        ]);
      });

      test('when the visitor taps Poslat jako soubor platby and closes the offer, then the phone was offered platba.spayd and the page points to the QR image', async ({
        page,
      }) => {
        await servePaymentDetails(page, []);
        await page.goto('/prispet');
        await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');

        await page.getByRole('button', { name: 'Poslat jako soubor platby' }).click();

        await expect(
          page.locator('#prispet .bank-app').getByRole('status').filter({ hasText: /\S/ }),
        ).toHaveText(
          'Neotevřela se vám banka? Zkuste Otevřít v aplikaci banky, které pošle QR jako obrázek, nebo zkopírujte údaje výše do bankovní aplikace.',
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
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'canShare', {
            value: (data: ShareData) =>
              (data.files ?? []).length > 0 &&
              (data.files ?? []).every((file) => file.type.startsWith('image/')),
            configurable: true,
          });
        });
        await servePaymentDetails(page, []);
        await page.goto('/prispet');
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
          {
            name: 'QR platba Nová naděje 500 Kč.png',
            type: 'image/png',
            text: '',
            title: 'QR platba',
          },
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
        await page.goto('/prispet');
        const bank = page.locator('#prispet .bank');
        await expect(bank).toContainText('5544332217/2010');

        await page.getByRole('radio', { name: 'Jiná částka' }).click();
        await expect(page.locator('#donate-custom-amount')).toHaveValue('');
        await showQr(page);
        await expect(page.locator('#prispet .qr-placeholder')).toHaveText('Nejprve zadejte částku');
        await page.locator('#donate-custom-amount').fill('2 500');
        await expect(bank).toContainText('2 500 Kč');
        await page.getByRole('button', { name: 'Kopírovat částku' }).click();

        await expect(page.getByRole('status').filter({ hasText: 'Zkopírováno.' })).toHaveCount(1);
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('2500');
        const bankTop = (await bank.boundingBox())!.y;
        const qrTop = (await page.locator('#prispet .qr').boundingBox())!.y;
        expect(bankTop).toBeLessThan(qrTop);
      });
    });
  });
});

test.describe('Given the QR payment drawn as small as the Přispět page draws it', () => {
  for (const appearance of ['light', 'dark'] as const) {
    test.describe(`on a computer screen of one pixel per point in the ${appearance} appearance`, () => {
      test.use({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        colorScheme: appearance,
      });

      test('when a bank app reads the picture of the code as the page shows it, then it gives the SPAYD text of the payment back', async ({
        page,
      }) => {
        await servePaymentDetails(page, []);
        await page.goto('/prispet');
        const qrCode = page.locator('#prispet app-qr-code');
        await expect(qrCode.getByRole('img', { name: QR_NAME })).toBeVisible();

        const picture = await qrCode.screenshot({ animations: 'disabled' });

        expect(await decodedQrText(page, picture)).toBe(PAYMENT_QR_500_SPAYD);
      });
    });
  }

  test.describe('on the narrowest phone with the largest text in the dark appearance', () => {
    test.use({
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });

    test('when a bank app reads the unfolded code and the code opened large, then both give the SPAYD text of the payment back', async ({
      page,
    }) => {
      await enlargedText(page, 200);
      await servePaymentDetails(page, []);
      await page.goto('/prispet');
      await showQr(page);
      const qrCode = page.locator('#prispet app-qr-code');
      await expect(qrCode.getByRole('img', { name: QR_NAME })).toBeVisible();

      const unfolded = await qrCode.screenshot({ animations: 'disabled' });
      await page.locator('#prispet button.zoomable').click();
      const enlarged = page.locator('dialog[open] app-qr-code.zoom-qr');
      await expect(enlarged.getByRole('img')).toBeVisible();
      const opened = await enlarged.screenshot({ animations: 'disabled' });

      expect(await decodedQrText(page, unfolded)).toBe(PAYMENT_QR_500_SPAYD);
      expect(await decodedQrText(page, opened)).toBe(PAYMENT_QR_500_SPAYD);
    });
  });
});
