import { Locator, Page } from '@playwright/test';
import jsQR from 'jsqr';
import { expect, test } from './fixtures';
import { waitWhileNothingMayHappen } from './fixed-waits';
import { openSection } from './donor-session';
import { expectUnfoldsByOneTransition, followUnfoldTransition } from './fold-transition';
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
const GAP_WITHOUT_ACTIONS = 64;
const ONE_FRAME_MS = 17;
const UNFOLD_SAMPLE_MS = 1000;
const PRESS_FRAMES = 5;
const DETAILS_FAILED =
  'Platební údaje se nepodařilo načíst. Zkuste to prosím znovu. Když to nepomůže, napište na info@nfnn.cz.';

function phoneLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) <= PHONE_LAYOUT_MAX_WIDTH;
}

async function showQr(page: Page): Promise<void> {
  if (phoneLayout(page)) {
    await page.getByRole('button', { name: /Platíte z\sjiného zařízení\?/ }).click();
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

interface FoldedFailure {
  alertAt: number;
  focusAt: number;
  foldedAt: number;
  inertAtAlert: boolean;
}

async function failureAfterRefusedQr(page: Page): Promise<FoldedFailure> {
  let answers = 0;
  await page.route(
    (url) => url.pathname === PAYMENT_DETAILS_PATH,
    async (route) => {
      answers += 1;
      await (answers === 1
        ? route.fulfill({
            json: {
              ...FOUNDATION_PAYMENT_DETAILS,
              messages: { ...FOUNDATION_PAYMENT_DETAILS.messages, donation: 'Dar*AM:1' },
            },
          })
        : route.fulfill({ status: 500, json: { title: 'Chyba serveru' } }));
    },
  );
  await page.goto('/prispet');
  const retry = page.locator('#prispet .qr-retry');
  await expect(retry).toBeVisible();
  await page.evaluate(() => {
    const seen: Partial<FoldedFailure> = {};
    (window as FoldedFailureWindow).foldedFailure = seen;
    const frame = (): void => {
      const now = performance.now();
      const actions = document.querySelector<HTMLElement>('#prispet .pay-actions');
      if (seen.alertAt === undefined && document.querySelector('#prispet .bank [role="alert"]')) {
        seen.alertAt = now;
        seen.inertAtAlert = actions?.hasAttribute('inert') ?? false;
      }
      if (
        seen.focusAt === undefined &&
        document.activeElement?.matches('#prispet .bank-failure-retry')
      ) {
        seen.focusAt = now;
      }
      if (
        seen.alertAt !== undefined &&
        seen.foldedAt === undefined &&
        (actions === null || actions.getBoundingClientRect().height < 1)
      ) {
        seen.foldedAt = now;
      }
      if (seen.focusAt === undefined || seen.foldedAt === undefined) {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  });
  await retry.focus();
  await retry.click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const seen = (window as FoldedFailureWindow).foldedFailure!;
        return seen.focusAt !== undefined && seen.foldedAt !== undefined;
      }),
    )
    .toBe(true);
  return page.evaluate(() => (window as FoldedFailureWindow).foldedFailure as FoldedFailure);
}

type FoldedFailureWindow = Window & { foldedFailure?: Partial<FoldedFailure> };

type HintWindow = Window & { hintSeen?: boolean };

type UnfoldWindow = Window & { unfoldHeights?: number[]; unfoldSampled?: boolean };

async function heldPaymentDetails(page: Page): Promise<{ fail: () => void }> {
  let fail: () => void = () => undefined;
  const failed = new Promise<void>((resolve) => (fail = resolve));
  await page.route(
    (url) => url.pathname === PAYMENT_DETAILS_PATH,
    async (route) => {
      await failed;
      await route.fulfill({ status: 503, json: { title: 'Nedostupné' } });
    },
  );
  return { fail };
}

async function edgeAgainstTokens(
  button: Locator,
): Promise<{ ground: string; surface: string; edge: string; border: string }> {
  return button.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--color-surface)';
    probe.style.borderColor = 'var(--color-border)';
    element.parentElement?.append(probe);
    const probed = getComputedStyle(probe);
    const surface = probed.backgroundColor;
    const border = probed.borderTopColor;
    probe.remove();
    const style = getComputedStyle(element);
    return { ground: style.backgroundColor, surface, edge: style.borderTopColor, border };
  });
}

async function expectCardFitsFailure(card: Locator): Promise<void> {
  const box = (await card.boundingBox())!;
  const failure = (await card.locator('.bank-failure').boundingBox())!;
  const above = failure.y - box.y;
  const below = box.y + box.height - (failure.y + failure.height);
  expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  expect(above).toBeLessThan(failure.height);
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

  test('when they open Jiná částka and go back to 500 Kč, then no hint about the amount shows in any frame', async ({
    page,
  }) => {
    await servePaymentDetails(page, []);
    await page.goto('/prispet');
    await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');
    await page.getByRole('radio', { name: 'Jiná částka' }).click();
    const field = page.getByLabel('Vlastní částka v korunách');
    await expect(field).toBeFocused();
    await page.evaluate(() => {
      const watched = window as HintWindow;
      watched.hintSeen = false;
      new MutationObserver(() => {
        if (document.querySelector('#prispet .amount-hint') !== null) {
          watched.hintSeen = true;
        }
      }).observe(document.body, { childList: true, subtree: true });
    });

    const preset = (await page.getByRole('radio', { name: '500 Kč' }).boundingBox())!;
    await page.mouse.move(preset.x + preset.width / 2, preset.y + preset.height / 2);

    await page.mouse.down();
    await page.evaluate(
      (frames) =>
        new Promise<void>((done) => {
          const next = (left: number) =>
            left === 0 ? done() : requestAnimationFrame(() => next(left - 1));
          next(frames);
        }),
      PRESS_FRAMES,
    );
    const hintWhilePressed = await page.evaluate(() => (window as HintWindow).hintSeen);
    await page.mouse.up();

    await expect(field).toHaveCount(0);
    expect(hintWhilePressed).toBe(false);
    expect(await page.evaluate(() => (window as HintWindow).hintSeen)).toBe(false);
  });

  test('when they type, delete and backspace in Jiná částka, then the thousands stay grouped, no digit is lost and the caret stays where they work', async ({
    page,
  }) => {
    await servePaymentDetails(page, []);
    await page.goto('/prispet');
    await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');
    await page.getByRole('radio', { name: 'Jiná částka' }).click();
    const field = page.getByLabel('Vlastní částka v korunách');
    const caret = () => field.evaluate((input: HTMLInputElement) => input.selectionStart);
    const placeCaret = (at: number) =>
      field.evaluate((input: HTMLInputElement, position) => {
        input.setSelectionRange(position, position);
      }, at);

    await field.pressSequentially('1250000');
    await expect(field).toHaveValue('1\u00a0250\u00a0000');
    expect(await caret()).toBe(9);

    await placeCaret(1);
    await page.keyboard.press('Delete');
    await expect(field).toHaveValue('150\u00a0000');
    expect(await caret()).toBe(1);

    await placeCaret(4);
    await page.keyboard.press('Backspace');
    await expect(field).toHaveValue('15\u00a0000');
    expect(await caret()).toBe(2);

    await field.fill('');
    await field.pressSequentially('1000');
    await expect(field).toHaveValue('1\u00a0000');
    await placeCaret(2);
    await page.keyboard.press('Backspace');
    await expect(field).toHaveValue('000');
    expect(await caret()).toBe(0);

    await page.keyboard.type('2');
    await expect(field).toHaveValue('2\u00a0000');
    expect(await caret()).toBe(1);
  });

  test('when they open Jiná částka, then its field unfolds over the token duration instead of jumping in at once (in Chromium over several frames, in WebKit by one grid-template-rows transition from 0fr to 1fr, not discrete, lasting --duration-base with the motion.expand easing, whose transitionend comes at least 80 % of that duration after the click while the fold stays rendered)', async ({
    page,
  }, testInfo) => {
    await servePaymentDetails(page, []);
    await page.goto('/prispet');
    await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');
    if (testInfo.project.name === 'iphone') {
      await followUnfoldTransition(page, {
        fold: '#prispet .amount app-fold',
        trigger: '#prispet .amount-options',
      });
      await page.getByRole('radio', { name: 'Jiná částka' }).click();
      await expectUnfoldsByOneTransition(page);
      return;
    }
    const amount = page.locator('#prispet .amount');
    const closedHeight = (await amount.boundingBox())!.height;
    await page.evaluate((sampleMs) => {
      const sampled = window as UnfoldWindow;
      sampled.unfoldHeights = [];
      const block = document.querySelector('#prispet .amount') as HTMLElement;
      const started = performance.now();
      const sample = () => {
        sampled.unfoldHeights!.push(block.getBoundingClientRect().height);
        if (performance.now() - started < sampleMs) {
          requestAnimationFrame(sample);
        } else {
          sampled.unfoldSampled = true;
        }
      };
      requestAnimationFrame(sample);
    }, UNFOLD_SAMPLE_MS);

    await page.getByRole('radio', { name: 'Jiná částka' }).click();

    await expect
      .poll(() => page.evaluate(() => (window as UnfoldWindow).unfoldSampled === true))
      .toBe(true);
    const heights = await page.evaluate(() => (window as UnfoldWindow).unfoldHeights!);
    const openHeight = heights[heights.length - 1];
    expect(openHeight).toBeGreaterThan(closedHeight + 1);
    expect(heights.some((height) => height > closedHeight + 1 && height < openHeight - 1)).toBe(
      true,
    );
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
    expect(await cardHeight(page)).toBeGreaterThan(failedHeight);
  });

  for (const look of [
    { name: 'light', colorScheme: 'light', contrast: 'no-preference' },
    { name: 'dark', colorScheme: 'dark', contrast: 'no-preference' },
    { name: 'increased contrast', colorScheme: 'light', contrast: 'more' },
  ] as const) {
    test(`when the payment details fail in the ${look.name} look, then Zkusit znovu stands on the surface ground with the quiet outline`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: look.colorScheme, contrast: look.contrast });
      await page.route(
        (url) => url.pathname === PAYMENT_DETAILS_PATH,
        (route) => route.fulfill({ status: 503, json: { title: 'Nedostupné' } }),
      );
      await page.goto('/prispet');
      const retry = page.locator('#prispet').getByRole('button', { name: 'Zkusit znovu' });
      await expect(retry).toBeVisible();

      await expect
        .poll(async () => {
          const { ground, surface, edge, border } = await edgeAgainstTokens(retry);
          return ground === surface && edge === border;
        })
        .toBe(true);
    });
  }

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
          'zásady ochrany osobních údajů',
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

  test.describe('on a computer', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('when the payment details fail, then the card shrinks to that message and its retry instead of keeping the height it had while loading', async ({
      page,
    }) => {
      const answer = await heldPaymentDetails(page);
      await page.goto('/prispet');
      const card = page.locator('#prispet .bank');
      await expect(card.locator('.bank-skeleton')).toBeAttached();
      const loadingHeight = await cardHeight(page);

      answer.fail();

      await expect(card.getByRole('alert')).toHaveText(DETAILS_FAILED);
      await expectCardFitsFailure(card);
      expect(await cardHeight(page)).toBeLessThan(loadingHeight);
    });
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
      const otherDevice = page.getByRole('button', { name: /Platíte z\sjiného zařízení\?/ });
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

    test('when the payment details fail, then the card shrinks to that message and its retry, with no bank buttons, other device or QR left under it', async ({
      page,
    }) => {
      const answer = await heldPaymentDetails(page);
      await page.goto('/prispet');
      const card = page.locator('#prispet .bank');
      await expect(card.locator('.bank-skeleton')).toBeAttached();
      const loadingHeight = await cardHeight(page);

      answer.fail();

      await expect(card.getByRole('alert')).toHaveText(DETAILS_FAILED);
      await expectCardFitsFailure(card);
      expect(await cardHeight(page)).toBeLessThan(loadingHeight);
      await expect(page.locator('#prispet .pay-actions')).toHaveAttribute('inert', '');
      await expect(page.locator('#prispet .bank-app')).toBeHidden();
      await expect(page.locator('#prispet .other-device')).toBeHidden();
      await expect(page.locator('#prispet .qr')).toBeHidden();
    });

    test('when the payment details fail after the code could not be made, then the bank actions are inert at once, the alert and the focus on Zkusit znovu come before they fold away, and Co bude dál then follows the card without a gap', async ({
      page,
    }) => {
      const failure = await failureAfterRefusedQr(page);

      expect(failure.inertAtAlert).toBe(true);
      expect(failure.alertAt).toBeLessThan(failure.foldedAt);
      expect(failure.focusAt).toBeLessThan(failure.foldedAt);
      await expect(page.locator('#prispet .pay-actions')).toBeHidden();
      const card = (await page.locator('#prispet .bank').boundingBox())!;
      const next = (await page.locator('#prispet .next').boundingBox())!;
      expect(next.y - (card.y + card.height)).toBeLessThan(GAP_WITHOUT_ACTIONS);
    });

    test('when the payment details fail with reduced motion, then the bank actions are gone in the frame the alert comes', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });

      const failure = await failureAfterRefusedQr(page);

      expect(failure.inertAtAlert).toBe(true);
      expect(failure.foldedAt - failure.alertAt).toBeLessThanOrEqual(ONE_FRAME_MS * 2);
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

test.describe('Given a visitor on Přispět on an upright iPad', () => {
  test('when Platíte z jiného zařízení? unfolds the QR code, then its card stands on the edges of the payment column and the amount stands whole with its currency on the caption’s last line', async ({
    page,
  }) => {
    await servePaymentDetails(page, []);
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/prispet');
    await page.getByRole('button', { name: /Platíte z\sjiného zařízení\?/ }).click();
    const region = page.locator('#prispet .qr[role="region"]');
    const card = region.locator('.qr-code');
    const caption = region.locator('.qr-caption');
    await expect(caption).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const column = (await page.locator('#prispet .other-device').boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    expect(Math.abs(cardBox.x - column.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(cardBox.x + cardBox.width - (column.x + column.width))).toBeLessThanOrEqual(1);

    const lines = await caption.evaluate((element) => {
      const byTop = new Map<number, string>();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (let index = 0; index < text.length; index++) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          if (rect.width === 0) {
            continue;
          }
          const top = Math.round(rect.top);
          byTop.set(top, (byTop.get(top) ?? '') + text[index]);
        }
      }
      return [...byTop.entries()].sort(([a], [b]) => a - b).map(([, line]) => line.trim());
    });
    expect(lines.at(-1), JSON.stringify(lines)).toMatch(/(^|\s)500\u00a0Kč\.$/);
  });
});

async function textLinesOf(value: Locator): Promise<string[]> {
  await value.page().evaluate(() => document.fonts.ready);
  return value.evaluate((element) => {
    const lines = new Map<number, string>();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index++) {
        if (text[index].trim() === '') {
          continue;
        }
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        lines.set(top, (lines.get(top) ?? '') + text[index]);
      }
    }
    return [...lines.entries()].sort(([a], [b]) => a - b).map(([, characters]) => characters);
  });
}

interface DetailType {
  fontSize: string;
  fontWeight: string;
  color: string;
}

async function typeOf(element: Locator): Promise<DetailType> {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return { fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
  });
}

async function centreOf(element: Locator): Promise<number> {
  const box = (await element.boundingBox())!;
  return box.y + box.height / 2;
}

async function aboutRow(page: Page, label: string): Promise<{ key: Locator; value: Locator }> {
  await page.goto('/o-nas');
  const item = page
    .locator('.accounting-item')
    .filter({ has: page.getByText(label, { exact: true }) });
  await expect(item.locator('.accounting-value')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return { key: item.locator('dt'), value: item.locator('.accounting-value') };
}

async function donateRow(page: Page, label: string): Promise<{ key: Locator; value: Locator }> {
  await page.goto('/prispet');
  const row = page.locator('#prispet .bank-row', { hasText: label });
  await expect(row.locator('.bank-value')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return { key: row.locator('.bank-key'), value: row.locator('.bank-value') };
}

test.describe('Given the bank details on O nás and on Přispět', () => {
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    test(`when they show at ${width} × ${height}, then Číslo účtu and IBAN read in one type on both pages`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      for (const label of ['Číslo účtu', 'IBAN']) {
        const about = await aboutRow(page, label);
        const aboutKey = await typeOf(about.key);
        const aboutValue = await typeOf(about.value);
        const donate = await donateRow(page, label);

        expect(aboutKey).toEqual(await typeOf(donate.key));
        expect(aboutValue).toEqual(await typeOf(donate.value));
      }
    });
  }

  test('when the IBAN takes two lines on a phone, then Kopírovat sits by the middle of both lines on both pages', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const open of [aboutRow, donateRow]) {
      const { value } = await open(page, 'IBAN');
      const copy = value.locator('xpath=..').locator('app-copy-button');

      expect(await textLinesOf(value)).toHaveLength(2);
      expect(Math.abs((await centreOf(copy)) - (await centreOf(value)))).toBeLessThanOrEqual(1);
    }
  });
});
