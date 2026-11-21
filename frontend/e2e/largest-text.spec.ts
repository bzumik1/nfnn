import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices, Locator, Page, Route } from '@playwright/test';
import { DIAGNOSTICS, logsApi, routeLogsApi } from './admin-logs-api';
import { LOGO_IMAGE_ID, mockBankLogos } from './bank-logos';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
  renamePetr,
  serveEmptyAdministrationCopy,
  servePetrBankAccounts,
  serveRecentDonors,
} from './baseline/screen-mocks';
import {
  DialogTitle,
  dialogsWithABoundTitle,
  everyDialogTitle,
  SHARED_TITLE_CLASS,
  titleGroup,
} from './dialog-titles';
import {
  administrator,
  bankAccountItem,
  claudeConnection,
  connectionRequest,
  donationItem,
  mockConnectApi,
  mockDonorApi,
  noDonations,
  openDonorSection,
  openSignInDialog,
  rememberedDonorSession,
  secondFactorRequired,
  showAccountList,
  signIn,
  whenAdministrationCopied,
} from './donor-session';
import { ADMINISTRATION_LOCKED, ADMINISTRATION_UNLOCK_PATH, expect, test } from './fixtures';
import {
  LongestKeptWord,
  longestKeptWord,
  oneLetterWordPairs,
  oneLetterGroupsPastTheirLine,
  boldReservesApartFromTheirLabel,
} from './kept-together';
import { serveReceiptKeys, serveReceiptStatus, YEARLY_RECEIPT } from './receipt-verification';

const LARGEST_SYSTEM_TEXT_PX = 53;

const PAGES_WITH_A_FULL_WIDTH_TITLE = ['/prispet', '/aktuality', '/projekty'];

const PAGES_WITH_A_TITLE = [...PAGES_WITH_A_FULL_WIDTH_TITLE, '/o-nas'];

async function showLargestSystemText(page: Page): Promise<void> {
  await page.addInitScript((px) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${px}px; }`;
      document.head.append(style);
    });
  }, LARGEST_SYSTEM_TEXT_PX);
}

async function linesOf(control: Locator): Promise<number> {
  return control.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
  });
}

async function wordsSplitAcrossLines(
  element: Locator,
  word: 'between-spaces' | 'between-spaces-and-hyphens' = 'between-spaces',
): Promise<string[]> {
  return element.evaluate((heading, kind) => {
    const text = heading.firstChild!;
    const pattern = kind === 'between-spaces' ? /\S+/g : /[^\s-]+-?/g;
    return Array.from((text.textContent ?? '').matchAll(pattern))
      .filter((word) => {
        const range = document.createRange();
        range.setStart(text, word.index);
        range.setEnd(text, word.index + word[0].length);
        return (
          new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size > 1
        );
      })
      .map((word) => word[0]);
  }, word);
}

async function linesOfTheBankCode(value: Locator): Promise<number> {
  await value.evaluate(() => document.fonts.ready);
  return value.evaluate((element) => {
    const tops: number[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index++) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if (rect && text[index].trim() !== '') {
          tops.push(Math.round(rect.top));
        }
      }
    }
    return new Set(tops.slice(-4)).size;
  });
}

async function numbersSplitAcrossLines(element: Locator): Promise<string[]> {
  await element.evaluate(() => document.fonts.ready);
  return element.evaluate((root) => {
    const split: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('.visually-hidden')) {
        continue;
      }
      for (const number of (node.textContent ?? '').matchAll(/[\d/-]{4,}/g)) {
        const range = document.createRange();
        range.setStart(node, number.index);
        range.setEnd(node, number.index + number[0].length);
        const tops = new Set(
          Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
        );
        if (tops.size > 1) {
          split.push(number[0]);
        }
      }
    }
    return split;
  });
}

async function lettersPastTheirCircle(circle: Locator, letters: Locator): Promise<number> {
  await circle.evaluate(() => document.fonts.ready);
  const circleBox: DOMRect = await circle.evaluate((element) =>
    element.getBoundingClientRect().toJSON(),
  );
  return letters.evaluate((element, frame) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = range.getBoundingClientRect();
    const radius = frame.width / 2;
    const centreX = frame.left + radius;
    const centreY = frame.top + frame.height / 2;
    const corners = [
      [box.left, box.top],
      [box.right, box.top],
      [box.left, box.bottom],
      [box.right, box.bottom],
    ];
    return Math.max(...corners.map(([x, y]) => Math.hypot(x - centreX, y - centreY) - radius));
  }, circleBox);
}

async function headingsOffScreen(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('main h1, main h2'))
      .filter((heading) => heading.getBoundingClientRect().width > 0)
      .filter(
        (heading) =>
          heading.scrollWidth > heading.clientWidth + 1 ||
          heading.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
      )
      .map((heading) => heading.textContent!.trim()),
  );
}

async function contentPastTheSides(dialog: Locator): Promise<string[]> {
  await dialog.evaluate(() => document.fonts.ready);
  return dialog.evaluate((element) => {
    const frame = element.getBoundingClientRect();
    const left = frame.left + element.clientLeft;
    const right = left + element.clientWidth;
    return Array.from(element.querySelectorAll<HTMLElement>('*'))
      .filter((part) => part.getClientRects().length > 0 && !part.closest('.visually-hidden'))
      .filter((part) => {
        const box = part.getBoundingClientRect();
        return box.width > 0 && (box.left < left - 1 || box.right > right + 1);
      })
      .map((part) => {
        const box = part.getBoundingClientRect();
        const name = (part.getAttribute('aria-label') ?? part.textContent ?? '')
          .trim()
          .slice(0, 30);
        return `${part.tagName.toLowerCase()}.${part.className} "${name}" ${Math.round(box.left)}..${Math.round(box.right)} in ${Math.round(left)}..${Math.round(right)}`;
      });
  });
}

for (const { width, height } of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
]) {
  test.describe(`Given a visitor on an iPhone ${width} pt wide whose installed app shows the largest accessibility text`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page }) => {
      await showLargestSystemText(page);
    });

    for (const path of ['/', ...PAGES_WITH_A_TITLE]) {
      test(`when they open ${path} signed out, then Přihlásit se stays on one line beside the logo`, async ({
        page,
      }) => {
        await page.goto(path);
        const banner = page.getByRole('banner');
        const signIn = banner.getByRole('button', { name: 'Přihlásit se' });
        await expect(signIn).toBeVisible();
        const logo = (await banner.getByRole('link').first().boundingBox())!;
        const button = (await signIn.boundingBox())!;

        expect(await linesOf(signIn)).toBe(1);
        expect(logo.x + logo.width).toBeLessThanOrEqual(button.x);
        expect(button.x + button.width).toBeLessThanOrEqual(width);
      });
    }

    test('when they open the home page, then the hero headline keeps each of its words whole', async ({
      page,
    }) => {
      await page.goto('/');
      const title = page.getByRole('heading', { level: 1, name: 'Nová naděje' });
      await expect(title).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      expect(await wordsSplitAcrossLines(title)).toEqual([]);
      expect(await headingsOffScreen(page)).toEqual([]);
    });

    for (const path of PAGES_WITH_A_TITLE) {
      test(`when they open ${path}, then the header leaves the page title free`, async ({
        page,
      }) => {
        await page.goto(path);
        const title = page.getByRole('heading', { level: 1 });
        await expect(title).toBeVisible();
        const button = (await page
          .getByRole('banner')
          .getByRole('button', { name: 'Přihlásit se' })
          .boundingBox())!;

        expect(button.y + button.height).toBeLessThanOrEqual((await title.boundingBox())!.y);
      });
    }

    for (const path of PAGES_WITH_A_FULL_WIDTH_TITLE) {
      test(`when they open ${path}, then every heading stays on screen`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        expect(await headingsOffScreen(page)).toEqual([]);
      });
    }

    test('when a signed-in donor looks at the account button and opens the account sheet, then the initials stay inside their circle at the largest text and at 200 %', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await page.setViewportSize({ width, height });
      const button = page.getByRole('banner').getByRole('button', { name: 'Účet' });
      const initials = button.locator('.account-initials');
      await expect(initials).toHaveText('JN');

      for (const textSize of ['largest', 'double']) {
        if (textSize === 'double') {
          await page.addStyleTag({ content: 'html { font-size: 32px; }' });
        }
        await expect
          .poll(() => lettersPastTheirCircle(button, initials), textSize)
          .toBeLessThanOrEqual(0);
        await button.click();
        const avatar = page.getByRole('dialog').locator('.account-profile .account-initials');
        await expect(avatar).toHaveText('JN');
        await expect
          .poll(() => lettersPastTheirCircle(avatar, avatar), textSize)
          .toBeLessThanOrEqual(0);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    });

    test('when a signed-in donor scrolls Údaje a zabezpečení, whose title wraps, then the title shows in the bar once the first line of the large title passes the bottom of the bar and goes when it comes back below', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Údaje a zabezpečení');
      await page.setViewportSize({ width, height });
      const heading = page.getByRole('heading', { level: 1, name: 'Údaje a zabezpečení' });
      await expect(heading).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await linesOf(heading)).toBeGreaterThan(1);
      const title = page.locator('.edge-title');
      const firstLinePastTheBar = (): Promise<number> =>
        heading.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const bar = document.querySelector('header.app-header')!.getBoundingClientRect();
          return range.getClientRects()[0].bottom - bar.height;
        });
      const bringTheFirstLineTo = async (pastTheBar: number): Promise<void> => {
        const pixels = (await firstLinePastTheBar()) - pastTheBar;
        await page.evaluate((top) => window.scrollBy({ top, behavior: 'instant' }), pixels);
      };
      const bar = page.locator('header.app-header');

      await expect(async () => {
        await bringTheFirstLineTo(-2);
        expect(await firstLinePastTheBar()).toBeLessThan(0);
        const large = (await heading.boundingBox())!;
        expect(large.y + large.height).toBeGreaterThan((await bar.boundingBox())!.height);
        await expect(title).toHaveClass(/edge-title--shown/, { timeout: 1000 });
      }).toPass();
      await expect(title).toHaveText('Údaje a zabezpečení');

      await expect(async () => {
        await bringTheFirstLineTo(2);
        expect(await firstLinePastTheBar()).toBeGreaterThan(0);
        await expect(title).not.toHaveClass(/edge-title--shown/, { timeout: 1000 });
      }).toPass();
    });

    test('when a signed-in donor opens Bankovní účty, then every account number stays within its card beside or under the logo of its bank', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) =>
          route.fulfill({
            json: {
              items: [
                bankAccountItem({ id: 'a-1', accountNumber: '19-2000145399/0800' }),
                bankAccountItem({ id: 'a-2', accountNumber: '2900233333/2010' }),
              ],
            },
          }),
      );
      await mockBankLogos(page, [{ code: '0800', imageId: LOGO_IMAGE_ID }]);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Bankovní účty');
      await page.setViewportSize({ width, height });
      const card = page.locator('.accounts-card');
      const numbers = card.locator('.account-number');
      await expect(numbers).toHaveCount(2);
      await page.evaluate(() => document.fonts.ready);

      const frame = (await card.boundingBox())!;
      for (const number of await numbers.all()) {
        const box = (await number.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(frame.x);
        expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
      }
      const withLogo = card.locator('.account', { hasText: '19-2000145399/0800' });
      const logo = (await withLogo.locator('app-bank-logo').boundingBox())!;
      const number = (await withLogo.locator('.account-number').boundingBox())!;
      expect(logo.y + logo.height).toBeLessThanOrEqual(number.y);
      expect(Math.abs(logo.x - number.x)).toBeLessThanOrEqual(1);
    });

    test('when a signed-in donor with a question about an older symbol opens Bankovní účty, then every account row keeps its number, state, question and actions within the row and the bank code of each number on one line', async ({
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
                  accountNumber: '19-2000145399/0800',
                  donationCount: 2,
                  totalAmountMinor: 60000,
                }),
                bankAccountItem({
                  id: 'a-2',
                  accountNumber: '2900233333/2010',
                  symbolOffer: {
                    variableSymbol: '6123456789',
                    paymentCount: 14,
                    firstMonth: '2025-01',
                    lastMonth: '2026-10',
                  },
                }),
              ],
            },
          }),
      );
      await mockBankLogos(page, [{ code: '0800', imageId: LOGO_IMAGE_ID }]);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Bankovní účty');
      await page.setViewportSize({ width, height });
      const rows = page.locator('li.account');
      await expect(rows).toHaveCount(2);
      await expect(page.locator('app-symbol-claim')).toBeVisible();

      for (const textSize of ['largest', 'double']) {
        if (textSize === 'double') {
          await page.addStyleTag({ content: 'html { font-size: 32px; }' });
        }
        for (const row of await rows.all()) {
          await expect.poll(() => contentPastTheSides(row), textSize).toEqual([]);
          await expect
            .poll(() => linesOfTheBankCode(row.locator('.account-number')), textSize)
            .toBe(1);
        }
      }
    });

    test('when a signed-in donor with a question about an account opens Můj přehled, then the question and Odpovědět stay whole within their notice', async ({
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
                  accountNumber: '19-2000145399/0800',
                  symbolOffer: {
                    variableSymbol: '1234567890',
                    paymentCount: 3,
                    firstMonth: '2026-09',
                    lastMonth: '2026-11',
                  },
                }),
              ],
            },
          }),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await page.setViewportSize({ width, height });
      const notice = page.locator('.overview-question');
      await expect(notice).toContainText('Odpovědět');

      await expect.poll(() => contentPastTheSides(notice)).toEqual([]);
    });

    test('when a signed-in donor without a gift opens Můj přehled, then Přidat účet, ze kterého jste platili and Zkontrolovat nové platby stay whole within the card Jak poslat první dar', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await page.setViewportSize({ width, height });
      const card = page.locator('section[aria-labelledby="first-gift-title"]');
      await expect(
        card.getByRole('link', { name: 'Přidat bankovní účet, ze kterého jste platili' }),
      ).toBeVisible();

      for (const textSize of ['largest', 'double']) {
        if (textSize === 'double') {
          await page.addStyleTag({ content: 'html { font-size: 32px; }' });
        }
        await expect.poll(() => contentPastTheSides(card), textSize).toEqual([]);
      }
    });

    test('when a signed-in donor with gifts opens Můj přehled and Moje dary, then the card Poslední dar and the bar of Všechny dary keep the bank check and its status within them', async ({
      page,
    }) => {
      await mockDonorApi(page, {
        summary: {
          ...noDonations.summary,
          totalAmountMinor: 50000,
          count: 1,
          lastReceivedAt: '2026-03-15',
          byYear: [{ year: 2026, count: 1, totalAmountMinor: 50000 }],
        },
        list: {
          items: [donationItem({ id: 'd-1' })],
          totalAmountMinor: 50000,
          currency: 'CZK',
          count: 1,
        },
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await page.setViewportSize({ width, height });
      const lastGift = page.locator('section[aria-labelledby="last-gift-title"]');
      await expect(
        lastGift.getByRole('button', { name: 'Zkontrolovat nové platby' }),
      ).toBeVisible();

      await expect.poll(() => contentPastTheSides(lastGift), 'largest').toEqual([]);
      const double = await page.addStyleTag({ content: 'html { font-size: 32px; }' });
      await expect.poll(() => contentPastTheSides(lastGift), 'double').toEqual([]);
      await double.evaluate((style) => style.remove());

      await page.setViewportSize({ width: 1280, height: 900 });
      await openDonorSection(page, 'Moje dary');
      await page.setViewportSize({ width, height });
      const bar = page.locator('.payments-card > .ui-card__bar');
      await expect(bar.getByRole('button', { name: 'Zkontrolovat nové platby' })).toBeVisible();

      for (const textSize of ['largest', 'double']) {
        if (textSize === 'double') {
          await page.addStyleTag({ content: 'html { font-size: 32px; }' });
        }
        await expect.poll(() => contentPastTheSides(bar), textSize).toEqual([]);
      }
    });

    test('when a signed-in donor opens Můj přehled and the standing order guide, then every bank detail of Poslat dar stays whole within its row and the bank code of the account number stays on one line', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await page.setViewportSize({ width, height });
      const card = page.locator('.send-gift');
      const rows = card.locator('.bank-row');
      await expect(rows.last()).toContainText('IBAN');
      await card.getByRole('button', { name: 'Jak nastavit trvalý příkaz' }).click();
      const guideRows = card.locator('.standing-row');
      await expect(guideRows.first()).toContainText('5544332217/2010');

      for (const textSize of ['largest', 'double']) {
        if (textSize === 'double') {
          await page.addStyleTag({ content: 'html { font-size: 32px; }' });
        }
        await expect.poll(() => contentPastTheSides(card.locator('.bank')), textSize).toEqual([]);
        for (const row of [...(await rows.all()), ...(await guideRows.all())]) {
          await expect.poll(() => contentPastTheSides(row), textSize).toEqual([]);
        }
        for (const value of [
          rows.first().locator('.bank-value'),
          guideRows.first().locator('.standing-value'),
        ]) {
          await expect.poll(() => linesOfTheBankCode(value), textSize).toBe(1);
        }
      }
    });

    test('when a signed-in donor opens Moje dary, then the date, the symbol and the account end of every gift row, a refunded one too, stay whole within it', async ({
      page,
    }) => {
      await mockDonorApi(page, {
        summary: {
          ...noDonations.summary,
          totalAmountMinor: 325000,
          count: 3,
          byYear: [{ year: 2026, count: 3, totalAmountMinor: 325000 }],
        },
        list: {
          items: [
            donationItem({
              id: 'd-1',
              amountMinor: 100000,
              pairedBy: 'SENDER_ACCOUNT',
              senderAccount: '19-2000145399/0800',
            }),
            donationItem({
              id: 'd-2',
              receivedAt: '2026-02-10',
              amountMinor: 25000,
              pairedBy: 'CONFIRMED_SYMBOL',
              senderAccount: '2900233333/2010',
              confirmedSymbol: '6123456789',
            }),
            donationItem({
              id: 'd-3',
              receivedAt: '2026-01-20',
              amountMinor: 200000,
              status: 'REFUNDED',
              receiptAvailable: false,
              pairedBy: 'SENDER_ACCOUNT',
              senderAccount: '2900233333/2010',
            }),
          ],
          totalAmountMinor: 325000,
          currency: 'CZK',
          count: 3,
        },
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Moje dary');
      await page.setViewportSize({ width, height });
      const rows = page.locator('.payments-card .donation-rows > li');
      await expect(rows).toHaveCount(3);

      for (const textSize of ['largest', 'double']) {
        if (textSize === 'double') {
          await page.addStyleTag({ content: 'html { font-size: 32px; }' });
        }
        for (const row of await rows.all()) {
          await expect.poll(() => numbersSplitAcrossLines(row), textSize).toEqual([]);
          await expect.poll(() => contentPastTheSides(row), textSize).toEqual([]);
        }
        const refunded = rows.nth(2).locator('.ui-list__state .ui-badge');
        await expect(refunded).toHaveText('Vráceno');
        await expect.poll(() => linesOf(refunded), textSize).toBe(1);
      }
    });

    test('when they open the sign-in dialog, then Přihlášení, Registrace and the close button stay whole on screen and the dialog never pans sideways', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      for (const name of ['Přihlášení', 'Registrace']) {
        const box = (await dialog.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      const close = dialog.getByRole('button', { name: 'Zavřít' });
      const button = (await close.boundingBox())!;
      const glyph = (await close.locator('svg, span').locator('visible=true').boundingBox())!;
      expect(glyph.x).toBeGreaterThanOrEqual(button.x - 1);
      expect(glyph.x + glyph.width).toBeLessThanOrEqual(button.x + button.width + 1);
      expect(await contentPastTheSides(dialog)).toEqual([]);
    });

    test('when they open the sign-in dialog, then the eye beside Heslo grows with the text, stands in the middle of its row clear of the password and reaches a finger', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
      const field = page
        .getByRole('dialog')
        .locator('app-form-field')
        .filter({
          has: page.locator('#login-password'),
        });
      const eye = field.getByRole('button', { name: 'Zobrazit heslo' });
      await expect(eye).toBeVisible();

      const measured = await field.evaluate((row) => {
        const label = row.querySelector('.field-label')!.getBoundingClientRect();
        const input = row.querySelector('input')!;
        const inputBox = input.getBoundingClientRect();
        const button = row.querySelector('.password-reveal')!;
        const buttonBox = button.getBoundingClientRect();
        const glyph = button.querySelector('svg')!.getBoundingClientRect();
        const touchTarget = parseFloat(
          getComputedStyle(button).getPropertyValue('--touch-target-size'),
        );
        const reachesAround = getComputedStyle(button, '::before').content !== 'none';
        const typing = getComputedStyle(input);
        return {
          rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
          glyph: glyph.height,
          offCentre: Math.abs((glyph.top + glyph.bottom) / 2 - (label.top + inputBox.bottom) / 2),
          typingEnd: inputBox.right - parseFloat(typing.paddingRight),
          eyeStart: glyph.left,
          reach: Math.min(
            Math.max(buttonBox.width, reachesAround ? touchTarget : 0),
            Math.max(buttonBox.height, reachesAround ? touchTarget : 0),
          ),
          touchTarget,
        };
      });

      expect(measured.glyph).toBeGreaterThanOrEqual(measured.rootPx);
      expect(measured.offCentre).toBeLessThanOrEqual(1);
      expect(measured.typingEnd).toBeLessThanOrEqual(measured.eyeStart);
      expect(measured.reach).toBeGreaterThanOrEqual(measured.touchTarget);
    });
  });
}

test.describe('Given a donor on an iPhone 390 pt wide whose installed app shows the largest accessibility text', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
  });

  test('when they open Bankovní účty, press Přidat bankovní účet and add an account, then its label breaks only between words, the icon stays by its first line and the row keeps its height', async ({
    page,
  }) => {
    await page.clock.install();
    await mockDonorApi(page);
    let dialogOpen = false;
    let paymentBooked = false;
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-check',
      (route) => {
        if (route.request().method() === 'POST' && dialogOpen) {
          paymentBooked = true;
        }
        return route.fulfill({
          status: 202,
          json: { bankDataAsOf: '2026-10-18T08:05:30Z', checking: false },
        });
      },
    );
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) =>
        route.fulfill({
          json: {
            items: paymentBooked
              ? [
                  bankAccountItem({
                    id: 'a-new',
                    accountNumber: '1234567890/0800',
                    verifiedOn: '2026-10-18',
                    verificationPaymentOn: '2026-10-18',
                  }),
                ]
              : [],
          },
        }),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');
    await page.setViewportSize({ width: 390, height: 844 });
    const add = page.getByRole('button', { name: 'Přidat bankovní účet' });
    await expect(add).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => layoutAtRest(add)).toBe(true);
    const label = add.locator('.ui-list__title');

    expect(await wordsBrokenInside(label)).toEqual([]);
    expect(await label.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    expect(await iconBesideTheFirstLineOf(add)).toBe(true);
    const height = (await add.boundingBox())!.height;

    const box = (await add.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect((await add.boundingBox())!.height).toBe(height);
    await page.mouse.move(box.x + box.width / 2, box.y - 200);
    await page.mouse.up();

    await add.click();
    dialogOpen = true;
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.add-account-watch')).toContainText('Čekáme na vaši platbu…');
    await page.clock.fastForward(30_000);
    await expect(dialog.locator('.add-account-watch')).toContainText('je ověřený');
    await dialog.getByRole('button', { name: 'Hotovo' }).click();
    await expect(page.locator('.accounts-list .account-number')).toHaveText('1234567890/0800');
    await expect.poll(() => layoutAtRest(add)).toBe(true);

    expect((await add.boundingBox())!.height).toBe(height);
    expect(await iconBesideTheFirstLineOf(add)).toBe(true);
  });
});

const DIALOGS_TITLED_ELSEWHERE: Record<string, string> = {
  'layout/account-sheet/account-sheet.html':
    'the account sheet shows its logo, or a section title on one line in its head row (sheet-head)',
  'shared/ui/dialog/dialog.html':
    'its own title, Zahodit rozepsané údaje?, carries ui-dialog__title',
  'shared/ui/zoom-viewer/zoom-viewer.html': 'the zoom viewer names itself for screen readers only',
};

const TITLES_FOR_SCREEN_READERS_ONLY = [
  'features/donors/login-dialog/login-dialog.html#visually-hidden',
];

interface OpenedTitle {
  readonly title: Locator;
  readonly column: Locator;
}

async function openOfflineSheet(page: Page): Promise<OpenedTitle> {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'requestIdleCallback', { value: () => 0 }),
  );
  await page.route('**/api/**', (route: Route) =>
    route.fulfill({ status: 522, contentType: 'text/html', body: 'origin down' }),
  );
  await page.goto('/');
  const label = page.getByRole('button', { name: /^Offline/ });
  await expect(label).toBeVisible({ timeout: 10_000 });
  await label.click();
  const sheet = page.getByRole('dialog', { name: 'Server neodpovídá' });
  await expect(sheet).toBeVisible();
  return { title: sheet.locator('.ui-dialog__title'), column: sheet };
}

async function openAddAccount(page: Page): Promise<OpenedTitle> {
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-check',
    (route) =>
      route.fulfill({
        status: 202,
        json: { bankDataAsOf: '2026-10-18T08:05:30Z', checking: false },
      }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) => route.fulfill({ json: { items: [] } }),
  );
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await openDonorSection(page, 'Bankovní účty');
  await page.setViewportSize(viewport);
  await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();
  const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
  await expect(dialog).toBeVisible();
  return { title: dialog.locator('#add-account-title'), column: dialog };
}

async function openPairedPayment(page: Page): Promise<OpenedTitle> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto('/sprava/platby?stav=prirazene');
  await copied();
  await page.locator('button.payment-row').first().click();
  const sheet = page.getByRole('dialog', { name: 'Přiřazená platba' });
  await expect(sheet).toBeVisible();
  return { title: sheet.locator('#payment-sheet-title'), column: sheet };
}

async function openErasure(page: Page): Promise<OpenedTitle> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto(`${PETR_DETAIL_PATH}/vymaz`);
  await copied();
  await page.getByRole('button', { name: 'Vymazat osobní údaje' }).click();
  const dialog = page.getByRole('dialog', { name: 'Vymazat osobní údaje: Petr Svoboda' });
  await expect(dialog).toBeVisible();
  return { title: dialog.locator('#erase-title'), column: dialog };
}

async function openOtherLoggerLevel(page: Page): Promise<OpenedTitle> {
  await mockDonorApi(page);
  await routeLogsApi(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto('/sprava/logy/urovne');
  await copied();
  await page.getByRole('button', { name: 'Jiný logger…' }).click();
  const sheet = page.getByRole('dialog', { name: 'Úroveň jiného loggeru' });
  await expect(sheet).toBeVisible();
  return { title: sheet.locator('#level-sheet-title'), column: sheet };
}

const TITLE_OPENERS: Record<string, (page: Page) => Promise<OpenedTitle>> = {
  [SHARED_TITLE_CLASS]: openOfflineSheet,
  'features/donors/dashboard/bank-accounts-card/bank-accounts-card.html#add-account-title':
    openAddAccount,
  'features/admin/payments/admin-payments.html#pair-title': openPairedPayment,
  'features/admin/donor-detail/admin-donor-detail.html#erase-title': openErasure,
  'features/admin/logs/levels/admin-log-levels.html#sheet-title': openOtherLoggerLevel,
};

async function titleTextsBrokenInside(
  title: Locator,
  titles: readonly DialogTitle[],
): Promise<string[]> {
  const samples = titles.flatMap(({ place, texts }) => texts.map((text) => ({ place, text })));
  return title.evaluate((original, texts) => {
    const broken: string[] = [];
    for (const { text, place } of texts) {
      const sample = original.cloneNode(false) as HTMLElement;
      sample.removeAttribute('id');
      sample.textContent = text;
      const wrapper = document.createElement('div');
      wrapper.className = place === 'ui-offer-sheet' ? place : '';
      wrapper.append(sample);
      original.after(wrapper);
      const node = sample.firstChild!;
      for (const word of text.matchAll(/[^\s-]+-?/g)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const tops = new Set(
          Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
        );
        if (tops.size > 1) {
          broken.push(`${place}: ${text}: ${word[0]}`);
        }
      }
      wrapper.remove();
    }
    return broken;
  }, samples);
}

async function fontSizes(title: Locator, token: string): Promise<{ title: number; token: number }> {
  return title.evaluate((element, name) => {
    const probe = document.createElement('span');
    probe.style.fontSize = `var(${name})`;
    element.after(probe);
    const sizes = {
      title: parseFloat(getComputedStyle(element).fontSize),
      token: parseFloat(getComputedStyle(probe).fontSize),
    };
    probe.remove();
    return sizes;
  }, token);
}

interface IconBesideText {
  readonly icon: number;
  readonly text: number;
  readonly cap: number;
}

async function iconsBesideTheirText(icons: Locator, row: string): Promise<IconBesideText[]> {
  await expect(icons.first()).toBeVisible();
  return icons.evaluateAll((elements, rowSelector) => {
    const cap = 2 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    return elements.map((element) => {
      const box = element.getBoundingClientRect();
      const owner = element.closest(rowSelector)!;
      const label = owner.querySelector('.ui-list__title') ?? owner;
      return {
        icon: Math.round(Math.min(box.width, box.height)),
        text: Math.round(parseFloat(getComputedStyle(label).fontSize)),
        cap: Math.round(cap),
      };
    });
  }, row);
}

test.describe('Given a donor in Safari on an iPhone 390 pt wide whose text is the largest accessibility size', () => {
  test.use({ viewport: { width: 390, height: 844 }, userAgent: devices['iPhone 15'].userAgent });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
  });

  test('when they open Bankovní účty, Údaje a zabezpečení and the account sheet, then the icon of Jak přiřazujeme platby?, of every signed-in device and of Přidat na plochu grows at least as large as its text and stops at twice the root text', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    const measured = await iconsBesideTheirText(
      page.locator('.accounts-help .accounts-help-icon'),
      '.accounts-help',
    );

    await openDonorSection(page, 'Údaje a zabezpečení');
    measured.push(
      ...(await iconsBesideTheirText(page.locator('.device-icon svg'), '.ui-list__row')),
    );

    const sheet = await showAccountList(page);
    measured.push(
      ...(await iconsBesideTheirText(
        sheet.locator('.account-install .ui-list__lead svg'),
        '.ui-list__row',
      )),
    );

    expect(measured.length).toBeGreaterThanOrEqual(3);
    expect(measured.filter(({ icon, text, cap }) => icon < text || icon > cap)).toEqual([]);
  });
});

test.describe('Given every title of a sheet or a dialog in the templates', () => {
  test('when they are listed, then each one is measured at the largest text, has no static text or is for screen readers only', () => {
    const measured = new Set(Object.keys(TITLE_OPENERS));
    const unmeasured = everyDialogTitle()
      .filter((title) => title.texts.length > 0)
      .map(titleGroup)
      .filter((group) => !measured.has(group) && !TITLES_FOR_SCREEN_READERS_ONLY.includes(group));

    expect(unmeasured).toEqual([]);
    expect(dialogsWithABoundTitle()).toEqual(Object.keys(DIALOGS_TITLED_ELSEWHERE).sort());
  });
});

test.describe('Given a visitor on an iPhone 390 pt wide whose installed app shows the largest accessibility text, opening a sheet or a dialog', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
  });

  for (const [group, open] of Object.entries(TITLE_OPENERS)) {
    test(`when they open a dialog titled by ${group}, then its title and every title of the templates in its place break only between words and stay at least as large as the sheet's body text`, async ({
      page,
    }) => {
      const { title } = await open(page);
      await page.evaluate(() => document.fonts.ready);
      const titles = everyDialogTitle().filter((candidate) => titleGroup(candidate) === group);

      expect(titles.flatMap((candidate) => candidate.texts)).not.toEqual([]);
      expect(await wordsBrokenInside(title)).toEqual([]);
      expect(await titleTextsBrokenInside(title, titles)).toEqual([]);
      const sizes = await fontSizes(title, '--text-sheet-body');
      expect(sizes.title).toBeGreaterThanOrEqual(sizes.token);
    });
  }

  test('when the shared title is gathered from the templates, then Server neodpovídá and the offers Upozornění jsou zapnutá and Zapnout upozornění? are among them', () => {
    const shared = everyDialogTitle().filter((title) => title.titleClass === SHARED_TITLE_CLASS);

    expect(
      shared.filter((title) => title.place === 'sheet').flatMap((title) => title.texts),
    ).toContain('Server neodpovídá');
    expect(
      shared.filter((title) => title.place === 'ui-offer-sheet').flatMap((title) => title.texts),
    ).toEqual(expect.arrayContaining(['Upozornění jsou zapnutá', 'Zapnout upozornění?']));
  });
});

for (const width of [390, 320]) {
  test.describe(`Given a visitor on a phone ${width} pt wide with the text at 200 %`, () => {
    test.use({ viewport: { width, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = 'html { font-size: 32px; }';
          document.head.append(style);
        });
      });
    });

    test('when they open Server neodpovídá, then its title takes the whole xl step, never less', async ({
      page,
    }) => {
      const { title } = await openOfflineSheet(page);

      const sizes = await fontSizes(title, '--text-xl');
      expect(sizes.title).toBe(sizes.token);
    });
  });
}

async function layoutAtRest(element: Locator): Promise<boolean> {
  return element.evaluate(async (target) => {
    const nextFrame = () => new Promise((settled) => requestAnimationFrame(settled));
    const before = target.getBoundingClientRect();
    await nextFrame();
    await nextFrame();
    const after = target.getBoundingClientRect();
    return (
      document.fonts.status === 'loaded' &&
      document.querySelector('dialog[open]') === null &&
      document.getAnimations().length === 0 &&
      before.left === after.left &&
      before.top === after.top &&
      before.width === after.width &&
      before.height === after.height
    );
  });
}

async function iconBesideTheFirstLineOf(row: Locator): Promise<boolean> {
  return row.evaluate((button) => {
    const label = button.querySelector('.ui-list__title')!;
    const range = document.createRange();
    range.selectNodeContents(label);
    const firstLine = range.getClientRects()[0];
    const icon = button.querySelector('.ui-list__glyph svg')!.getBoundingClientRect();
    const middle = icon.top + icon.height / 2;
    return middle >= firstLine.top && middle <= firstLine.bottom;
  });
}

test.describe('Given an administrator on a phone 320 pt wide with the text at 200 %', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'html { font-size: 200%; }';
        document.head.append(style);
      });
    });
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/admin/donations/import-state',
      (route) =>
        route.fulfill({
          json: {
            coveredFrom: '2026-07-20',
            coveredTo: '2026-10-17',
            lastAttemptedAt: '2026-10-17T10:00:00Z',
            lastSucceededAt: '2026-10-17T10:00:00Z',
            lastFailure: null,
            consecutiveFailures: 0,
            reportedOutage: null,
            historyImport: null,
            defaultHistoryFrom: '2026-01-01',
          },
        }),
    );
    await rememberedDonorSession(page, { user: administrator });
  });

  for (const { path, heading, nav } of [
    { path: '/sprava', heading: 'Správa', nav: 'Sekce správy' },
    { path: '/sprava/vice', heading: 'Občas a pro technika', nav: 'Další sekce správy' },
  ]) {
    test(`when they open ${path}, then every section row breaks only between words or after a hyphen and the page never pans sideways`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const titles = page.getByRole('navigation', { name: nav }).locator('.ui-list__title');
      await expect(titles.first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      for (const title of await titles.all()) {
        expect(await wordsSplitAcrossLines(title, 'between-spaces-and-hyphens')).toEqual([]);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
    });
  }

  test('when they open the card of a donor with a long name, then the head of the sheet keeps the name on one line between Zpět and Zavřít', async ({
    page,
  }) => {
    const name = 'Marie Kateřina Nováková-Svobodová z Dlouhé Lhoty u Českých Budějovic';
    await mockAdministration(page);
    await renamePetr(page, name);
    await page.goto(PETR_DETAIL_PATH);
    await expect(page.getByRole('heading', { level: 1, name })).toBeAttached();
    const head = page.getByRole('banner');
    const title = head.getByText(name, { exact: true });
    await expect(title).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const room = await title.evaluate((element) => {
      const root = getComputedStyle(document.documentElement);
      return {
        oneLine: parseFloat(getComputedStyle(element).lineHeight),
        inset: parseFloat(root.getPropertyValue('--sheet-close-inset')),
        button: parseFloat(root.getPropertyValue('--sheet-close-size')),
      };
    });
    const headBox = (await head.boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    expect(titleBox.height).toBeLessThanOrEqual(room.oneLine + 1);
    expect(headBox.height).toBeLessThanOrEqual(room.inset + room.button + room.oneLine);
    await expect(head.getByRole('button', { name: 'Zpět' })).toBeInViewport({ ratio: 1 });
    await expect(head.getByRole('button', { name: 'Zavřít' })).toBeInViewport({ ratio: 1 });
  });

  test('when they open /sprava/logy with a level raised and errors today, then every row title that is not a file name breaks only between words and the page never pans sideways', async ({
    page,
  }) => {
    await routeLogsApi(page);
    await page.route(
      (url) => url.pathname === DIAGNOSTICS,
      (route) =>
        route.fulfill({
          json: {
            ...(logsApi()['diagnostics'] as object),
            logLevelOverrides: [
              { logger: 'cz.novanadeje.app', level: 'DEBUG', until: '2026-10-23T10:30:00Z' },
            ],
          },
        }),
    );
    await page.goto('/sprava/logy');
    await expect(page.getByRole('heading', { level: 1, name: 'Logy a diagnostika' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Úrovně logování 1 dočasně/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Fio refused the request/ })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const split = await page
      .getByRole('main')
      .locator('.ui-list__title:not(.problem-message, .ui-mono)')
      .evaluateAll((lines) =>
        lines.flatMap((line) => {
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          const broken: string[] = [];
          for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
            for (const word of (text.textContent ?? '').matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(text, word.index);
              range.setEnd(text, word.index + word[0].length);
              const tops = new Set(
                Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
              );
              if (tops.size > 1) {
                broken.push(word[0]);
              }
            }
          }
          return broken;
        }),
      );
    expect(split).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });

  test('when they open /sprava/logy/stav with long values, then every value wraps within its row and never runs into the padding of its card', async ({
    page,
  }) => {
    await routeLogsApi(page);
    const diagnostics = logsApi()['diagnostics'] as { database: object };
    await page.route(
      (url) => url.pathname === DIAGNOSTICS,
      (route) =>
        route.fulfill({
          json: {
            ...diagnostics,
            database: { ...diagnostics.database, activeConnections: 123456789 },
          },
        }),
    );
    await page.goto('/sprava/logy/stav');
    await expect(page.getByRole('heading', { level: 1, name: 'Stav serveru' })).toBeVisible();
    await expect(page.getByText('123456789 v práci')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const overflowing = await page
      .getByRole('main')
      .locator('.ui-list__row > .ui-list__value')
      .evaluateAll((values) =>
        values
          .filter((value) => {
            const row = value.parentElement!;
            const content =
              row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);
            return value.getBoundingClientRect().right > content + 0.5;
          })
          .map((value) => value.textContent?.trim()),
      );
    expect(overflowing).toEqual([]);
  });
});

test.describe('Given a visitor verifying a receipt on a phone 320 pt wide with the text at 200 %', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'html { font-size: 200%; }';
        document.head.append(style);
      });
    });
    await mockDonorApi(page);
    await serveReceiptKeys(page);
    await serveReceiptStatus(page, 'active');
  });

  for (const { name, address, heading } of [
    { name: 'without a code', address: '/overit', heading: 'Ověření potvrzení o daru' },
    {
      name: 'with the code of a yearly receipt',
      address: `/overit#${YEARLY_RECEIPT.fragment}`,
      heading: 'Podepsáno fondem Nová naděje',
    },
  ]) {
    test(`when they open the page ${name}, then every card and row title breaks only between words or after a hyphen and the page never pans sideways`, async ({
      page,
    }) => {
      await page.goto(address);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const titles = page
        .getByRole('main')
        .locator(':is(.ui-card__title, .ui-list__title):not(.visually-hidden)');
      expect(await titles.count()).toBeGreaterThan(1);
      for (const title of await titles.all()) {
        expect(await wordsSplitAcrossLines(title, 'between-spaces-and-hyphens')).toEqual([]);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
    });
  }
});

async function wordsBrokenInside(element: Locator): Promise<string[]> {
  return element.evaluate((root) => {
    const broken: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const word of (node.textContent ?? '').matchAll(/[^\s-]+-?/g)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const tops = new Set(
          Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
        );
        if (tops.size > 1) {
          broken.push(word[0]);
        }
      }
    }
    return broken;
  });
}

test.describe('Given an administrator on a phone 320 pt wide with the text at 200 % on a page of cards', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'html { font-size: 200%; }';
        document.head.append(style);
      });
    });
    await mockDonorApi(page, donorWithDonations);
    await mockAdministration(page);
    await rememberedSession(page);
  });

  for (const { path, heading, cards, serve } of [
    { path: '/sprava/upozorneni', heading: 'Upozornění', cards: 'main' },
    { path: '/sprava/zalohy/historie', heading: 'Všechny zálohy', cards: 'main' },
    { path: '/sprava/prehledy/2026-09', heading: 'Přehled za září 2026', cards: 'main' },
    { path: PETR_DETAIL_PATH, heading: 'Petr Svoboda', cards: 'main nav.card-rows' },
    ...['udaje', 'prihlaseni', 'bankovni-ucty', 'dary', 'potvrzeni', 'vymaz'].map((part) => ({
      path: `${PETR_DETAIL_PATH}/${part}`,
      heading: 'Petr Svoboda',
      cards: 'main',
    })),
    { path: '/sprava/darci', heading: 'Dárci', cards: 'main', serve: serveRecentDonors },
    { path: '/sprava/platby', heading: 'Platby z banky', cards: 'main' },
    { path: '/sprava/platby?stav=prirazene', heading: 'Platby z banky', cards: 'main' },
  ]) {
    test(`when they open ${path}, then every card title and row breaks only between words or after a hyphen and no card reaches past the screen`, async ({
      page,
    }) => {
      await serve?.(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const scope = page.locator(cards);
      const texts = scope.locator(
        ':is(.ui-card__title, .ui-card__subtitle, .ui-list__title, .ui-list__meta, .ui-list__value)',
      );
      await expect(texts.first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      for (const text of await texts.all()) {
        expect(await wordsBrokenInside(text)).toEqual([]);
      }
      expect(await scope.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
        await scope.evaluate((element) => element.clientWidth),
      );
      expect(
        await scope.evaluate((element) => Math.round(element.getBoundingClientRect().right)),
      ).toBeLessThanOrEqual(320);
      const overflowing = await scope
        .locator('.ui-list__row > .ui-list__value')
        .evaluateAll((values) =>
          values
            .filter((value) => {
              const row = value.parentElement!;
              const content =
                row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);
              return value.getBoundingClientRect().right > content + 0.5;
            })
            .map((value) => value.textContent?.trim() || value.getAttribute('role')),
        );
      expect(overflowing).toEqual([]);
      const switchesUnderTheirText = await scope
        .locator('.ui-list__row > .ui-switch')
        .evaluateAll((switches) =>
          switches
            .filter((control) => {
              const title = control.parentElement!.querySelector('.ui-list__title')!;
              return (
                control.getBoundingClientRect().left < title.getBoundingClientRect().right - 0.5
              );
            })
            .map((control) => control.getAttribute('aria-describedby')),
        );
      expect(switchesUnderTheirText).toEqual([]);
    });
  }

  test('when they open the monthly report, then Uložit nastavení keeps room for Ukládáme… and both labels wrap within the button and its form instead of being cut', async ({
    page,
  }) => {
    await page.goto('/sprava/prehledy');
    const save = page.locator('form.settings-form button[type="submit"]');
    await expect(save).toHaveAccessibleName('Uložit nastavení');
    await page.evaluate(() => document.fonts.ready);

    const cut = await save.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const left = box.left + parseFloat(style.paddingLeft) - 0.5;
      const right = box.right - parseFloat(style.paddingRight) + 0.5;
      return Array.from(button.querySelectorAll('.busy-label__face'))
        .filter((face) => {
          const range = document.createRange();
          range.selectNodeContents(face);
          return Array.from(range.getClientRects()).some(
            (rect) => rect.left < left || rect.right > right,
          );
        })
        .map((face) => face.textContent?.trim());
    });
    expect(cut).toEqual([]);
    expect(await wordsBrokenInside(save)).toEqual([]);
    expect(
      await save.evaluate(
        (button) =>
          button.getBoundingClientRect().right - button.form!.getBoundingClientRect().right,
      ),
    ).toBeLessThanOrEqual(0.5);
  });
});

interface SummaryPair {
  label: { left: number; right: number; top: number; bottom: number };
  value: { left: number; top: number };
}

async function summaryPairs(summary: Locator): Promise<SummaryPair[]> {
  return summary.locator('dl > div').evaluateAll((rows) =>
    rows.map((row) => {
      const label = row.querySelector('dt')!.getBoundingClientRect();
      const value = row.querySelector('dd')!.getBoundingClientRect();
      return {
        label: { left: label.left, right: label.right, top: label.top, bottom: label.bottom },
        value: { left: value.left, top: value.top },
      };
    }),
  );
}

async function firstLines(
  summary: Locator,
): Promise<{ label: { bottom: number }; value: { bottom: number } }[]> {
  return summary.locator('dl > div').evaluateAll((rows) => {
    const firstLine = (element: Element): { bottom: number } => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          node.textContent?.trim() &&
          !node.parentElement?.closest('.visually-hidden, [aria-hidden="true"]')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
      });
      const text = walker.nextNode()!;
      const range = document.createRange();
      range.selectNodeContents(text);
      return { bottom: range.getClientRects()[0].bottom };
    };
    return rows.map((row) => ({
      label: firstLine(row.querySelector('dt')!),
      value: firstLine(row.querySelector('dd')!),
    }));
  });
}

async function pastTheirCard(card: Locator): Promise<string[]> {
  return card.evaluate((root) => {
    const style = getComputedStyle(root);
    const box = root.getBoundingClientRect();
    const left = box.left + root.clientLeft + parseFloat(style.paddingLeft);
    const right = box.left + root.clientLeft + root.clientWidth - parseFloat(style.paddingRight);
    return Array.from(root.querySelectorAll<HTMLElement>('dt, dd, dd *'))
      .filter((element) => !element.closest('.visually-hidden'))
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < left - 0.5 || rect.right > right + 0.5;
      })
      .map(
        (element) =>
          `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim()}" ${Math.round(element.getBoundingClientRect().right)} past ${Math.round(right)}`,
      );
  });
}

test.describe('Given an administrator on a phone 390 pt wide opening the card of a donor', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, donorWithDonations);
    await mockAdministration(page);
    await rememberedSession(page);
  });

  const openSummary = async (page: Page): Promise<Locator> => {
    await page.goto(PETR_DETAIL_PATH);
    await expect(page.getByRole('heading', { level: 1, name: 'Petr Svoboda' })).toBeAttached();
    const summary = page.getByRole('region', { name: 'Shrnutí dárce' });
    await expect(summary.locator('dt').last()).toHaveText('Dvoufaktorové ověření');
    await page.evaluate(() => document.fonts.ready);
    return summary;
  };

  test.describe('with the text at 200 %', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = 'html { font-size: 200%; }';
          document.head.append(style);
        });
      });
    });

    test('when they look at the summary, then every label stands above its value on one left axis, no word breaks inside, E-mail stays on one line and Kopírovat stays whole within the card', async ({
      page,
    }) => {
      const summary = await openSummary(page);

      const words = summary.locator(
        ':is(dt, dd:not(.summary-symbol):not(:has(.email)), dd .tag, .summary-symbol .ui-figures, .summary-symbol .copy-button__action > span:not(.visually-hidden))',
      );
      for (const text of await words.all()) {
        expect(await wordsBrokenInside(text)).toEqual([]);
      }
      const emailLabel = summary.locator('dt').nth(1);
      await expect(emailLabel).toHaveText('E-mail');
      const emailLabelLines = await emailLabel.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
      });
      expect(emailLabelLines).toBe(1);

      const pairs = await summaryPairs(summary);
      const axis = pairs[0].label.left;
      for (const { label, value } of pairs) {
        expect(value.top).toBeGreaterThanOrEqual(label.bottom - 0.5);
        expect(Math.abs(label.left - axis)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(value.left - axis)).toBeLessThanOrEqual(0.5);
      }

      expect(await pastTheirCard(summary)).toEqual([]);
      const copy = summary.getByRole('button', { name: 'Kopírovat variabilní symbol' });
      await expect(copy).toBeInViewport({ ratio: 1 });
      const copyBox = (await copy.boundingBox())!;
      expect(copyBox.height).toBeGreaterThanOrEqual(24);
      expect(copyBox.width).toBeGreaterThanOrEqual(24);
    });
  });

  test('when they look at the summary at the default text size, then every label stays beside the first line of its value, Kopírovat stays on the line of the symbol and ověřen on the line of the e-mail', async ({
    page,
  }) => {
    const summary = await openSummary(page);

    const pairs = await summaryPairs(summary);
    for (const { label, value } of pairs) {
      expect(value.left).toBeGreaterThanOrEqual(label.right - 0.5);
    }
    for (const { label, value } of await firstLines(summary)) {
      expect(Math.abs(label.bottom - value.bottom)).toBeLessThanOrEqual(2);
    }
    const symbol = (await summary.locator('.summary-symbol .ui-figures').boundingBox())!;
    const copy = (await summary
      .getByRole('button', { name: 'Kopírovat variabilní symbol' })
      .boundingBox())!;
    expect(copy.y).toBeLessThan(symbol.y + symbol.height / 2);
    expect(copy.y + copy.height).toBeGreaterThan(symbol.y + symbol.height / 2);
    const email = (await summary.locator('.email').boundingBox())!;
    const verified = (await summary.getByText('ověřen', { exact: true }).boundingBox())!;
    expect(verified.y).toBeLessThan(email.y + email.height / 2);
    expect(verified.y + verified.height).toBeGreaterThan(email.y + email.height / 2);
    expect(await pastTheirCard(summary)).toEqual([]);
  });

  test('when the device could not store the administration and they look at the card at the default text size, then the notice with Uložit znovu keeps the same gap above the summary as the cards keep between them', async ({
    page,
  }) => {
    const summary = await openSummary(page);
    const notice = page.locator('.first-download');
    await expect(notice.getByRole('button', { name: 'Uložit znovu' })).toBeVisible();
    const parts = page.getByRole('navigation', { name: 'Části karty dárce' });
    await expect(parts).toBeVisible();

    const noticeBox = (await notice.boundingBox())!;
    const summaryBox = (await summary.boundingBox())!;
    const partsBox = (await parts.boundingBox())!;
    const noticeGap = summaryBox.y - (noticeBox.y + noticeBox.height);
    const cardGap = partsBox.y - (summaryBox.y + summaryBox.height);
    expect(noticeGap).toBeGreaterThanOrEqual(8);
    expect(Math.abs(noticeGap - cardGap)).toBeLessThanOrEqual(0.5);
  });
});

async function badgesPastTheirRow(scope: Locator): Promise<string[]> {
  await scope.evaluate(() => document.fonts.ready);
  return scope.locator('.ui-badge').evaluateAll((badges) =>
    badges
      .filter((badge) => badge.getClientRects().length > 0)
      .filter((badge) => {
        const row = badge.closest('tr')!;
        const style = getComputedStyle(row);
        const frame = row.getBoundingClientRect();
        const left = frame.left + row.clientLeft + parseFloat(style.paddingLeft);
        const right =
          frame.left + row.clientLeft + row.clientWidth - parseFloat(style.paddingRight);
        const box = badge.getBoundingClientRect();
        return box.left < left - 0.5 || box.right > right + 0.5;
      })
      .map((badge) => {
        const box = badge.getBoundingClientRect();
        return `"${(badge.textContent ?? '').trim()}" ${Math.round(box.left)}..${Math.round(box.right)}`;
      }),
  );
}

test.describe('Given an administrator on an iPhone 390 pt wide whose installed app shows the largest accessibility text', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
    await mockDonorApi(page, donorWithDonations);
    await mockAdministration(page);
    await servePetrBankAccounts(page, [bankAccountItem({ shared: true, pairingExcluded: true })]);
    await rememberedSession(page);
  });

  test('when they open the bank accounts of a donor whose account pairs only with the variable symbol, then every badge wraps within the content box of its row', async ({
    page,
  }) => {
    await page.goto(`${PETR_DETAIL_PATH}/bankovni-ucty`);
    const table = page.locator('main table');
    await expect(table.locator('.ui-badge', { hasText: 'variabilním symbolem' })).toBeVisible();

    await expect.poll(() => badgesPastTheirRow(table)).toEqual([]);
  });
});

test.describe('Given an administrator on a tablet 768 pt wide opening the card of a donor', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, donorWithDonations);
    await mockAdministration(page);
    await rememberedSession(page);
  });

  test('when they look at the summary at the default text size, then every label stays beside the first line of its value and the values share one column', async ({
    page,
  }) => {
    await page.goto(PETR_DETAIL_PATH);
    await expect(page.getByRole('heading', { level: 1, name: 'Petr Svoboda' })).toBeAttached();
    const summary = page.getByRole('region', { name: 'Shrnutí dárce' });
    await expect(summary.locator('dt').last()).toHaveText('Dvoufaktorové ověření');
    await page.evaluate(() => document.fonts.ready);

    const pairs = await summaryPairs(summary);
    const column = pairs[0].value.left;
    for (const { label, value } of pairs) {
      expect(value.left).toBeGreaterThanOrEqual(label.right - 0.5);
      expect(Math.abs(value.left - column)).toBeLessThanOrEqual(0.5);
    }
    for (const { label, value } of await firstLines(summary)) {
      expect(Math.abs(label.bottom - value.bottom)).toBeLessThanOrEqual(2);
    }
    expect(await pastTheirCard(summary)).toEqual([]);
  });
});

for (const { phone, viewport } of [
  { phone: 'an iPhone Pro Max', viewport: { width: 440, height: 956 } },
  { phone: 'an iPhone SE', viewport: { width: 375, height: 667 } },
]) {
  test.describe(`Given an administrator on ${phone} with the text at 200 % whose device could not store the administration`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = 'html { font-size: 200%; }';
          document.head.append(style);
        });
      });
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await rememberedSession(page);
    });

    test('when they open the card of a donor, then Uložit znovu stands under the notice text at its start, the text keeps whole phrases on each line and the notice keeps a gap above the summary', async ({
      page,
    }) => {
      await page.goto(PETR_DETAIL_PATH);
      const notice = page.locator('.first-download');
      const retry = notice.getByRole('button', { name: 'Uložit znovu' });
      await expect(notice).toBeVisible();
      await expect(retry).toBeVisible();
      const summary = page.getByRole('region', { name: 'Shrnutí dárce' });
      await expect(summary).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const text = notice.locator('.first-download__title');
      const textBox = (await text.boundingBox())!;
      const retryBox = (await retry.boundingBox())!;
      expect(retryBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height - 0.5);
      expect(Math.abs(retryBox.x - textBox.x)).toBeLessThanOrEqual(0.5);

      const characters = (await text.textContent())!.trim().replace(/\s+/g, ' ').length;
      expect(characters / (await linesOf(text))).toBeGreaterThanOrEqual(12);

      const noticeBox = (await notice.boundingBox())!;
      const summaryBox = (await summary.boundingBox())!;
      expect(summaryBox.y - (noticeBox.y + noticeBox.height)).toBeGreaterThanOrEqual(8);
    });
  });
}

async function datesPastTheirCells(scope: Locator): Promise<string[]> {
  await scope.evaluate(() => document.fonts.ready);
  return scope.evaluate((element) => {
    const cellOf = (date: Element): HTMLElement => {
      let cell = date.parentElement!;
      while (/^(inline|contents)/.test(getComputedStyle(cell).display) && cell.parentElement) {
        cell = cell.parentElement;
      }
      return cell;
    };
    return Array.from(element.querySelectorAll<HTMLElement>('.ui-date'))
      .filter((date) => date.getClientRects().length > 0)
      .filter((date) => {
        const cell = cellOf(date);
        const left = cell.getBoundingClientRect().left + cell.clientLeft;
        const right = left + cell.clientWidth;
        const box = date.getBoundingClientRect();
        return box.left < left - 1 || box.right > right + 1;
      })
      .map((date) => {
        const cell = cellOf(date);
        return `"${(date.textContent ?? '').trim()}" ${Math.round(date.getBoundingClientRect().right)} past ${cell.tagName.toLowerCase()}.${cell.className} ending ${Math.round(cell.getBoundingClientRect().left + cell.clientLeft + cell.clientWidth)}`;
      });
  });
}

const PUBLIC_PAGES_WITH_A_LEAD = [
  '/prispet',
  '/aktuality',
  '/projekty',
  '/o-nas',
  '/zasady-ochrany-osobnich-udaju',
  '/neexistuje',
];

async function lastWordsOfLines(element: Locator): Promise<string[]> {
  await element.evaluate(() => document.fonts.ready);
  return element.evaluate((root) => {
    const lines = new Map<number, string>();
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const word of (node.textContent ?? '').matchAll(/[^ \t\n]+/g)) {
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const rects = range.getClientRects();
        const top = Math.round(rects[rects.length - 1].top);
        lines.set(top, word[0].split('\u00a0').at(-1) ?? '');
      }
    }
    return [...lines.entries()].sort(([a], [b]) => a - b).map(([, last]) => last);
  });
}

test.describe('Given a visitor on an iPad on its side whose root text is 34 px', () => {
  test.use({ viewport: { width: 1180, height: 820 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'html { font-size: 34px; }';
        document.head.append(style);
      });
    });
  });

  for (const path of PUBLIC_PAGES_WITH_A_LEAD) {
    test(`when they open ${path}, then no line of the intro's lead ends with a one-letter word`, async ({
      page,
    }) => {
      await page.goto(path);
      const lead = page.locator('.ui-intro__lead').first();
      await expect(lead).toBeVisible();

      expect(await lead.textContent()).not.toMatch(/(^|\s)[aikosuvz] /i);
      expect((await lastWordsOfLines(lead)).filter((word) => /^[aikosuvz]$/i.test(word))).toEqual(
        [],
      );
    });
  }
});

for (const rootPx of [34, 53]) {
  test.describe(`Given an administrator in a window 1180 pt wide whose root text is ${rootPx} px`, () => {
    test.use({ viewport: { width: 1180, height: 820 } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((px) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `html { font-size: ${px}px; }`;
          document.head.append(style);
        });
      }, rootPx);
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await rememberedSession(page);
    });

    for (const path of [
      `${PETR_DETAIL_PATH}/udaje`,
      `${PETR_DETAIL_PATH}/bankovni-ucty`,
      `${PETR_DETAIL_PATH}/dary`,
      `${PETR_DETAIL_PATH}/potvrzeni`,
      '/sprava',
      '/sprava/platby',
    ]) {
      test(`when they open ${path}, then every date of a short item stays within its cell`, async ({
        page,
      }) => {
        await page.goto(path);
        const main = page.locator('main');
        await expect(main.locator('.ui-date').first()).toBeVisible();

        await expect.poll(() => datesPastTheirCells(main)).toEqual([]);
      });
    }
  });
}

for (const textSize of ['100%', '200%']) {
  test.describe(`Given an administrator on a computer 1280 px wide with the text at ${textSize}`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((size) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `html { font-size: ${size}; }`;
          document.head.append(style);
        });
      }, textSize);
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await rememberedSession(page);
    });

    test('when they open /sprava/starsi-symboly, then every answer stays on one line within its cell and every donor name breaks only between words within its cell', async ({
      page,
    }) => {
      await page.goto('/sprava/starsi-symboly');
      const table = page.locator('main table');
      const answers = table.locator('.answer-tag');
      await expect(answers).toHaveCount(2);

      for (const answer of await answers.all()) {
        expect(await textLinesOf(answer)).toHaveLength(1);
      }
      const names = table.locator('.admin-name');
      for (const name of await names.all()) {
        expect(await wordsBrokenInside(name)).toEqual([]);
      }
      expect(await pastTheirCells(table, '.answer-tag, .admin-name, app-bank-account')).toEqual([]);
    });
  });
}

test.describe('Given an administrator on a computer 1280 px wide with the text at its default size', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, donorWithDonations);
    await mockAdministration(page);
    await rememberedSession(page);
  });

  test('when they open /sprava/starsi-symboly, then the bank logo and the account number of every row share one line', async ({
    page,
  }) => {
    await page.goto('/sprava/starsi-symboly');
    const accounts = page.locator('main table app-bank-account');
    await expect(accounts).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready);

    const apart = await accounts.evaluateAll((elements) =>
      elements
        .filter((account) => {
          const logo = account.querySelector('app-bank-logo')!.getBoundingClientRect();
          const number = account.querySelector('.ui-figures')!.getBoundingClientRect();
          return logo.bottom <= number.top || logo.top >= number.bottom;
        })
        .map((account) => (account.textContent ?? '').trim()),
    );
    expect(apart).toEqual([]);
  });

  test('when they open /sprava/starsi-symboly, then the table stays within its card and its last cell keeps the space of the card title', async ({
    page,
  }) => {
    await page.goto('/sprava/starsi-symboly');
    const card = page.locator('main section.ui-card');
    await expect(card.locator('tbody tr')).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready);

    const edges = await card.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const inner = box.right - element.clientLeft;
      const title = element.querySelector('.ui-card__title')!;
      const titleInset =
        title.getBoundingClientRect().left +
        parseFloat(getComputedStyle(title).paddingLeft) -
        (box.left + element.clientLeft);
      const table = element.querySelector('table')!.getBoundingClientRect();
      const lastControls = Array.from(element.querySelectorAll('tbody td:last-child button')).map(
        (button) => inner - button.getBoundingClientRect().right,
      );
      return {
        tablePastCard: Math.max(0, Math.round(table.right - inner)),
        narrowestEnd: Math.round(Math.min(...lastControls)),
        titleInset: Math.round(titleInset),
      };
    });

    expect(edges.tablePastCard).toBe(0);
    expect(edges.narrowestEnd).toBeGreaterThanOrEqual(edges.titleInset - 1);
  });
});

async function pastTheirCells(scope: Locator, selector: string): Promise<string[]> {
  return scope.evaluate((element, wanted) => {
    return Array.from(element.querySelectorAll<HTMLElement>(wanted))
      .filter((item) => {
        const cell = item.closest('td')!;
        const left = cell.getBoundingClientRect().left + cell.clientLeft;
        const right = left + cell.clientWidth;
        const box = item.getBoundingClientRect();
        return box.left < left - 1 || box.right > right + 1;
      })
      .map((item) => (item.textContent ?? '').trim());
  }, selector);
}

async function textLinesOf(element: Locator): Promise<string[]> {
  await element.evaluate(() => document.fonts.ready);
  return element.evaluate((root) => {
    const lines = new Map<number, string>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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

async function valuesUnderTheirCopyButtons(card: Locator): Promise<string[]> {
  return card.evaluate((element) =>
    Array.from(element.querySelectorAll('dd'))
      .filter((field) => field.querySelector('app-copy-button button'))
      .filter((field) => {
        const value = field.querySelector<HTMLElement>('.accounting-value')!;
        const box = value.getBoundingClientRect();
        const right = box.left + Math.max(box.width, value.scrollWidth);
        const button = field.querySelector('app-copy-button button')!.getBoundingClientRect();
        return (
          box.left < button.right &&
          right > button.left + 0.5 &&
          box.top < button.bottom &&
          box.bottom > button.top + 0.5
        );
      })
      .map((field) => field.querySelector('.accounting-value')!.textContent!.trim()),
  );
}

async function copyButtonsWithinFingerReachOfEachOther(card: Locator): Promise<string[]> {
  return card.evaluate((element) => {
    const reach = parseFloat(getComputedStyle(element).getPropertyValue('--touch-target-size'));
    const areas = Array.from(element.querySelectorAll('app-copy-button button')).map((button) => {
      const box = button.getBoundingClientRect();
      const grow = Math.max(0, reach - box.height) / 2;
      return { name: button.textContent!.trim(), top: box.top - grow, bottom: box.bottom + grow };
    });
    return areas
      .slice(1)
      .filter((area, index) => area.top < areas[index].bottom - 0.5)
      .map((area, index) => `${areas[index].name} | ${area.name}`);
  });
}

for (const { screen, viewport, rootPx } of [
  { screen: 'a computer 1280 px wide', viewport: { width: 1280, height: 900 }, rootPx: null },
  { screen: 'an iPad on its side', viewport: { width: 1180, height: 820 }, rootPx: 34 },
  {
    screen: 'an iPad on its side',
    viewport: { width: 1180, height: 820 },
    rootPx: LARGEST_SYSTEM_TEXT_PX,
  },
]) {
  test.describe(`Given an accountant on ${screen} whose text is at ${rootPx ? `${rootPx} px` : 'its default size'}`, () => {
    test.use({ viewport });

    test('when they open Údaje pro účetní on O nás, then every value stays within the card and clear of its copy button, the copy buttons stand in one column, their touch areas never overlap and the IBAN breaks only between its groups of four', async ({
      page,
    }) => {
      if (rootPx) {
        await page.addInitScript((px) => {
          document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style');
            style.textContent = `html { font-size: ${px}px; }`;
            document.head.append(style);
          });
        }, rootPx);
      }
      await mockDonorApi(page);
      await page.goto('/o-nas');
      const card = page.locator('app-accounting-details .accounting');
      await expect(card).toContainText('CZ26 2010 0000 0055 4433 2217');

      expect(await contentPastTheSides(card)).toEqual([]);
      expect(await valuesUnderTheirCopyButtons(card)).toEqual([]);
      expect(await copyButtonsWithinFingerReachOfEachOther(card)).toEqual([]);
      const rightEdges = await card
        .locator('app-copy-button button')
        .evaluateAll((buttons) =>
          buttons.map((button) => Math.round(button.getBoundingClientRect().right)),
        );
      expect(new Set(rightEdges).size).toBe(1);
      for (const line of await textLinesOf(
        card.locator('.accounting-value').filter({ hasText: 'CZ26' }),
      )) {
        expect(line).toMatch(/^([A-Z0-9]{4})+$/);
      }
    });
  });
}

for (const { pose, width, rootSize } of [
  { pose: 'an iPhone SE 320 pt wide with the text at 200 %', width: 320, rootSize: '200%' },
  {
    pose: 'an iPhone Pro Max 430 pt wide with the largest accessibility text',
    width: 430,
    rootSize: `${LARGEST_SYSTEM_TEXT_PX}px`,
  },
]) {
  test.describe(`Given an administrator on ${pose} on Údaje a zabezpečení`, () => {
    test('when they ask to sign out a device, disconnect an application or remove a passkey, then each resting label stays on one line within its row as before, though it keeps room for its busy label', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donors/me/connections',
        (route) => route.fulfill({ json: { items: [claudeConnection] } }),
      );
      await page.route(
        (url) => url.pathname === '/api/donors/me/passkeys',
        (route) =>
          route.fulfill({
            json: {
              items: [
                {
                  id: '019a1b2c-3d4e-7f00-8000-000000000001',
                  name: 'iPhone',
                  createdAt: '2026-10-17T10:00:00Z',
                  lastUsedAt: '2026-10-22T09:00:00Z',
                },
              ],
            },
          }),
      );
      await signIn(page, administrator);
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
      await openDonorSection(page, 'Údaje a zabezpečení');

      const devices = page.locator('.devices');
      await devices.getByRole('button', { name: /^Odhlásit iPhone/ }).click();
      const signOut = devices.locator('.devices-confirm-yes');
      await expect(signOut).toHaveAccessibleName('Odhlásit');
      const disconnect = page.locator('.connection-disconnect');
      await expect(disconnect).toHaveAccessibleName('Odpojit');
      await page.getByRole('button', { name: 'Spravovat přístupové klíče' }).click();
      const passkeys = page.getByRole('region', { name: 'Přístupové klíče' });
      await passkeys.getByRole('button', { name: 'Odebrat', exact: true }).click();
      const remove = passkeys.locator('.passkey-confirm .ui-button--danger-soft');
      await expect(remove).toHaveAccessibleName('Ano, odebrat');
      await page.evaluate(() => document.fonts.ready);

      for (const [button, row] of [
        [signOut, page.locator('.device-confirm')],
        [disconnect, page.locator('.connection')],
        [remove, passkeys.locator('.passkey-confirm')],
      ] as const) {
        const placed = await button.evaluate(
          (control, box) => {
            const shown = control.querySelector('.busy-label__face--shown') ?? control;
            const range = document.createRange();
            range.selectNodeContents(shown);
            const lines = new Set(
              Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
            ).size;
            const style = getComputedStyle(box!);
            const rowBox = box!.getBoundingClientRect();
            const own = control.getBoundingClientRect();
            return {
              lines,
              within:
                own.left >= rowBox.left + parseFloat(style.paddingLeft) - 1 &&
                own.right <= rowBox.right - parseFloat(style.paddingRight) + 1,
            };
          },
          await row.elementHandle(),
        );
        expect(placed, await button.evaluate((control) => control.textContent?.trim())).toEqual({
          lines: 1,
          within: true,
        });
      }
    });

    test('when the four busy buttons it can reach start working and the loading delay passes, then each keeps its height while its busy label shows', async ({
      page,
    }) => {
      await page.clock.install();
      await mockDonorApi(page);
      const pending = { newEmail: 'jana.nova@example.cz', expiresAt: '2026-10-21T10:00:00Z' };
      await page.route(
        (url) => url.pathname === '/api/donors/me',
        (route) => route.fulfill({ json: { ...administrator, pendingEmailChange: pending } }),
      );
      await page.route(
        (url) => url.pathname === '/api/donors/me/connections',
        (route) => route.fulfill({ json: { items: [claudeConnection] } }),
      );
      await page.route(
        (url) => url.pathname === '/api/donors/me/passkeys',
        (route) =>
          route.fulfill({
            json: {
              items: [
                {
                  id: '019a1b2c-3d4e-7f00-8000-000000000001',
                  name: 'iPhone',
                  createdAt: '2026-10-17T10:00:00Z',
                  lastUsedAt: '2026-10-22T09:00:00Z',
                },
              ],
            },
          }),
      );
      const neverAnswered = new Promise<void>(() => undefined);
      for (const path of [
        '/api/donors/me/devices/',
        '/api/donors/me/connections/',
        '/api/donors/me/passkeys/',
        '/api/donors/me/email-change/resend',
      ]) {
        await page.route(
          (url) => url.pathname.startsWith(path),
          async () => neverAnswered,
        );
      }
      await signIn(page, { ...administrator, pendingEmailChange: pending });
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
      await openDonorSection(page, 'Údaje a zabezpečení');

      const devices = page.locator('.devices');
      await devices.getByRole('button', { name: /^Odhlásit iPhone/ }).click();
      const signOut = devices.locator('.devices-confirm-yes');
      const disconnect = page.locator('.connection-disconnect');
      const resend = page.locator('.account-resend');
      await page.getByRole('button', { name: 'Spravovat přístupové klíče' }).click();
      const passkeys = page.getByRole('region', { name: 'Přístupové klíče' });
      await passkeys.getByRole('button', { name: 'Odebrat', exact: true }).click();
      const remove = passkeys.locator('.passkey-confirm .ui-button--danger-soft');
      const buttons = [signOut, disconnect, remove, resend];
      for (const button of buttons) {
        await expect(button).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready);
      const heights = async () =>
        Promise.all(
          buttons.map((button) =>
            button.evaluate((control) => Math.round(control.getBoundingClientRect().height)),
          ),
        );
      const resting = await heights();
      for (const button of buttons) {
        expectHeldByTheTallerLabel(
          await busyLayout(button),
          await button.evaluate((control) => control.textContent?.trim() ?? ''),
        );
      }
      await page.evaluate(() =>
        document.documentElement.style.setProperty('--delay-loading', '10s'),
      );

      for (const button of buttons) {
        await button.click();
      }
      await page.clock.fastForward(10_000);

      for (const [button, busyLabel] of [
        [signOut, 'Odhlašujeme…'],
        [disconnect, 'Odpojujeme…'],
        [remove, 'Odebíráme…'],
        [resend, 'Posíláme…'],
      ] as const) {
        await expect(button.locator('.busy-label__face--shown')).toHaveText(busyLabel);
      }
      const working = await heights();
      for (const button of buttons) {
        expectHeldByTheTallerLabel(
          await busyLayout(button),
          await button.evaluate((control) => control.textContent?.trim() ?? ''),
        );
      }
      for (const [index, height] of working.entries()) {
        expect(
          Math.abs(height - resting[index]),
          `${await buttons[index].evaluate((control) => control.textContent?.trim())}: ${resting[index]} → ${height}`,
        ).toBeLessThanOrEqual(1);
      }
    });

    test('when they open the passkeys, then the panel opens in place under Spravovat and Odebrat never moves while it opens, so a press on it lands', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donors/me/passkeys',
        (route) =>
          route.fulfill({
            json: {
              items: [
                {
                  id: '019a1b2c-3d4e-7f00-8000-000000000001',
                  name: 'iPhone',
                  createdAt: '2026-10-17T10:00:00Z',
                  lastUsedAt: '2026-10-22T09:00:00Z',
                },
              ],
            },
          }),
      );
      await signIn(page, administrator);
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
      await openDonorSection(page, 'Údaje a zabezpečení');
      const manage = page.getByRole('button', { name: 'Spravovat přístupové klíče' });
      await expect(manage).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const offsets = await manage.evaluate(
        (button) =>
          new Promise<number[]>((settled) => {
            const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
            const seen: number[] = [];
            const frame = () => {
              const remove = Array.from(
                panel.querySelectorAll<HTMLElement>('.passkey-actions button'),
              ).find((candidate) => candidate.textContent?.trim() === 'Odebrat');
              if (remove !== undefined && remove.getBoundingClientRect().height > 0) {
                seen.push(
                  Math.round(
                    remove.getBoundingClientRect().top - button.getBoundingClientRect().bottom,
                  ),
                );
              }
              const opening = panel.getAnimations({ subtree: true }).length > 0;
              if ((seen.length > 0 && !opening) || seen.length > 120) {
                settled(seen);
              } else {
                requestAnimationFrame(frame);
              }
            };
            button.click();
            requestAnimationFrame(frame);
          }),
      );

      expect(offsets.length).toBeGreaterThan(0);
      expect(new Set(offsets)).toEqual(new Set([offsets.at(-1)]));
    });
  });
}

test.describe('Given a donor on an iPhone 390 pt wide whose installed app shows the largest accessibility text', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await showLargestSystemText(page);
  });

  test('when they open Údaje a zabezpečení, then the label E-mail stays on one line and Změnit never covers it', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.setViewportSize({ width: 390, height: 844 });
    const label = page.locator('#account-email-label');
    const change = page.locator('app-account-card').getByRole('button', { name: 'Změnit e-mail' });
    await expect(label).toHaveText('E-mail');
    await expect(change).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    expect(await linesOf(label)).toBe(1);
    const text = await label.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const box = range.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    const button = (await change.boundingBox())!;
    const apart =
      text.right <= button.x ||
      button.x + button.width <= text.left ||
      text.bottom <= button.y ||
      button.y + button.height <= text.top;
    expect(apart, `E-mail ${JSON.stringify(text)} and Změnit ${JSON.stringify(button)}`).toBe(true);
  });
});

interface BusyLayout {
  height: number;
  label: number;
  tallerFace: number;
  wordsBrokenInside: string[];
}

function busyLayout(button: Locator): Promise<BusyLayout> {
  return button.evaluate((control) => {
    const label = control.querySelector('app-busy-label') as HTMLElement;
    const faces = Array.from(label.querySelectorAll<HTMLElement>('.busy-label__face'));
    const wordsBrokenInside = faces.flatMap((face) => {
      const broken: string[] = [];
      const walker = document.createTreeWalker(face, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        for (const word of (node.textContent ?? '').matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const lines = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
          const longerThanTheLine =
            lines.reduce((sum, rect) => sum + rect.width, 0) > face.clientWidth + 1;
          if (new Set(lines.map((rect) => Math.round(rect.top))).size > 1 && !longerThanTheLine) {
            broken.push(word[0]);
          }
        }
      }
      return broken;
    });
    return {
      height: Math.round(control.getBoundingClientRect().height),
      label: Math.round(label.getBoundingClientRect().height),
      tallerFace: Math.round(Math.max(...faces.map((face) => face.getBoundingClientRect().height))),
      wordsBrokenInside,
    };
  });
}

function expectHeldByTheTallerLabel(layout: BusyLayout, name: string): void {
  expect(layout.wordsBrokenInside, `${name}: words broken inside`).toEqual([]);
  expect(
    Math.abs(layout.label - layout.tallerFace),
    `${name}: label ${layout.label}, taller face ${layout.tallerFace}`,
  ).toBeLessThanOrEqual(1);
}

function expectSameHeight(resting: BusyLayout, working: BusyLayout, name: string): void {
  expect(
    Math.abs(working.height - resting.height),
    `${name}: ${resting.height} → ${working.height}`,
  ).toBeLessThanOrEqual(1);
}

for (const { pose, width, rootSize } of [
  { pose: 'an iPhone SE 320 pt wide with the text at 200 %', width: 320, rootSize: '200%' },
  {
    pose: 'an iPhone Pro Max 430 pt wide with the largest accessibility text',
    width: 430,
    rootSize: `${LARGEST_SYSTEM_TEXT_PX}px`,
  },
]) {
  test.describe(`Given a visitor in the sign-in dialog on ${pose}`, () => {
    test('when they ask for the registration link again and the loading delay passes, then Poslat odkaz znovu keeps its height while Odesíláme… shows', async ({
      page,
    }) => {
      await page.clock.install();
      await mockDonorApi(page);
      await page.route('**/api/donors/auth/register', (route) =>
        route.fulfill({ status: 202, body: '' }),
      );
      const neverAnswered = new Promise<void>(() => undefined);
      await page.route('**/api/donors/auth/email-verification/request', async () => neverAnswered);
      await openSignInDialog(page);
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Registrace' }).click();
      await dialog.locator('#register-name').fill('Jana Nováková');
      await dialog.locator('#register-street').fill('Dlouhá 12');
      await dialog.locator('#register-postal-code').fill('400 01');
      await dialog.locator('#register-city').fill('Ústí nad Labem');
      await dialog.locator('#register-email').fill('jana@example.cz');
      await dialog.locator('#register-password').fill('correct horse battery');
      await dialog.getByRole('button', { name: 'Vytvořit účet' }).click();
      const resend = dialog.locator('.registration-resend');
      await expect(resend).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const resting = await busyLayout(resend);
      expectHeldByTheTallerLabel(resting, 'Poslat odkaz znovu');

      await resend.click();
      await page.clock.fastForward(1_000);

      await expect(resend.locator('.busy-label__face--shown')).toHaveText('Odesíláme…');
      const working = await busyLayout(resend);
      expectHeldByTheTallerLabel(working, 'Odesíláme…');
      expectSameHeight(resting, working, 'Poslat odkaz znovu');
    });

    test('when they try the connection again while offline and the loading delay passes, then Zkusit znovu keeps its height while Zkoušíme se připojit… shows', async ({
      page,
    }) => {
      await page.clock.install();
      await page.goto('/darce/prehled');
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('#login-email')).toBeVisible();
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
      const neverAnswered = new Promise<void>(() => undefined);
      await page.route(
        (url) => url.pathname === '/api/operations/setup',
        async () => neverAnswered,
      );
      try {
        const now = await page.evaluate(() => Date.now());
        await page.clock.pauseAt(now + 1_000);
        await page.evaluate(() => {
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
          window.dispatchEvent(new Event('offline'));
        });
        await page.clock.runFor(200);
        const retry = dialog.locator('.offline-entry-try-again');
        await expect(retry).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const resting = await busyLayout(retry);
        expectHeldByTheTallerLabel(resting, 'Zkusit znovu');

        await retry.click();
        await page.clock.runFor(1_000);

        await expect(retry.locator('.busy-label__face--shown')).toHaveText('Zkoušíme se připojit…');
        const working = await busyLayout(retry);
        expectHeldByTheTallerLabel(working, 'Zkoušíme se připojit…');
        expectSameHeight(resting, working, 'Zkusit znovu');
      } finally {
        await page.clock.resume();
      }
    });

    test('when the unseen busy label holds a word longer than the line, then only that word breaks, the button stays within the dialog and holds the height of that label', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await openSignInDialog(page);
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
      const submit = page.getByRole('dialog').locator('.login-form .ui-button--primary');
      await expect(submit).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      await submit.evaluate((control) => {
        const unseen = control.querySelector('.busy-label__face:not(.busy-label__face--shown)');
        unseen!.textContent = 'Přihlašujeme'.repeat(4);
      });

      const layout = await busyLayout(submit);
      expectHeldByTheTallerLabel(layout, 'Přihlásit se with a long unseen word');
      const placed = await submit.evaluate((control) => {
        const panel = control.closest('.dialog-panel')!.getBoundingClientRect();
        const box = control.getBoundingClientRect();
        const unseen = control.querySelector('.busy-label__face:not(.busy-label__face--shown)')!;
        const range = document.createRange();
        range.selectNodeContents(unseen);
        const lines = new Set(
          Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
        );
        return {
          withinTheDialog: box.left >= panel.left - 1 && box.right <= panel.right + 1,
          nothingPastTheButton: control.scrollWidth <= control.clientWidth + 1,
          longWordBroken: lines.size > 1,
        };
      });
      expect(placed).toEqual({
        withinTheDialog: true,
        nothingPastTheButton: true,
        longWordBroken: true,
      });
    });

    test('when they reach the code from the app and type it, then the whole code fits its field, which starts at its label', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route('**/api/donors/auth/login', (route) =>
        route.fulfill(secondFactorRequired()),
      );
      await openSignInDialog(page);
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
      const dialog = page.getByRole('dialog');
      await dialog.locator('#login-email').fill('jana@example.cz');
      await dialog.locator('#login-password').fill('correct horse battery');
      await dialog.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
      const code = dialog.locator('#login-code');

      await code.fill('287082');

      const placed = await code.evaluate((input) => {
        const label = document.querySelector(`label[for="${input.id}"]`)!;
        return {
          fits: input.scrollWidth <= input.clientWidth,
          startsAtLabel:
            Math.round(input.getBoundingClientRect().left) ===
            Math.round(label.getBoundingClientRect().left),
        };
      });
      expect(placed).toEqual({ fits: true, startsAtLabel: true });
    });
  });
}

for (const { pose, width, rootSize } of [
  { pose: 'an iPhone SE 320 pt wide with the text at 200 %', width: 320, rootSize: '200%' },
  {
    pose: 'an iPhone Pro Max 430 pt wide with the largest accessibility text',
    width: 430,
    rootSize: `${LARGEST_SYSTEM_TEXT_PX}px`,
  },
]) {
  test.describe(`Given an administrator on ${pose} on Zálohy`, () => {
    test('when they start a backup and the loading delay passes, then Zálohovat teď keeps its height while Zálohujeme… shows', async ({
      page,
    }) => {
      await page.clock.install();
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await rememberedSession(page);
      const neverAnswered = new Promise<void>(() => undefined);
      await page.route(
        (url) => url.pathname === '/api/admin/operations/backups/requests',
        async () => neverAnswered,
      );
      await page.goto('/sprava/zalohy');
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), rootSize);
      const backUp = page
        .locator('button')
        .filter({ has: page.locator('.busy-label__face', { hasText: 'Zálohovat teď' }) });
      await expect(backUp).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const resting = await busyLayout(backUp);
      expectHeldByTheTallerLabel(resting, 'Zálohovat teď');

      await backUp.click();
      await page.clock.fastForward(1_000);

      await expect(backUp.locator('.busy-label__face--shown')).toHaveText('Zálohujeme…');
      const working = await busyLayout(backUp);
      expectHeldByTheTallerLabel(working, 'Zálohujeme…');
      expectSameHeight(resting, working, 'Zálohovat teď');
    });
  });
}

async function overflowAtTheLargestText(page: Page): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready);
  return oneLetterGroupsPastTheirLine(page);
}

for (const width of [320, 390]) {
  test.describe(`Given a visitor on an iPhone ${width} pt wide whose installed app shows the largest accessibility text, whose groups kept together may break only where they are wider than the line`, () => {
    test.use({ viewport: { width, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await showLargestSystemText(page);
      await mockDonorApi(page);
      await mockConnectApi(page);
    });

    for (const path of [
      '/',
      '/o-nas',
      '/prispet',
      '/zasady-ochrany-osobnich-udaju',
      connectionRequest,
    ]) {
      test(`when they open ${path.split('?')[0]}, then no word kept with a one-letter word reaches past its line, though a group wider than its line may break`, async ({
        page,
      }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        expect.soft(await overflowAtTheLargestText(page), path).toEqual([]);
      });
    }

    for (const [group, open] of Object.entries(TITLE_OPENERS)) {
      test(`when they open the sheet titled by ${group}, then no word kept with a one-letter word in its title, buttons or choices reaches past its line`, async ({
        page,
      }) => {
        await open(page);

        expect.soft(await overflowAtTheLargestText(page), group).toEqual([]);
      });
    }
  });

  test.describe(`Given an administrator on an iPhone ${width} pt wide whose installed app shows the largest accessibility text, whose groups kept together may break only where they are wider than the line`, () => {
    test.use({ viewport: { width, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await showLargestSystemText(page);
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await serveEmptyAdministrationCopy(page);
    });

    for (const path of [
      '/sprava',
      '/sprava/platby',
      '/sprava/darci',
      '/sprava/zalohy',
      '/sprava/nastaveni',
      '/sprava/lide-fondu',
      '/sprava/logy',
    ]) {
      test(`when they open ${path}, then no word kept with a one-letter word in a title, short button, segmented choice or narrow cell reaches past its line`, async ({
        page,
      }) => {
        await rememberedSession(page);
        const copied = whenAdministrationCopied(page);
        await page.goto(path);
        await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
        await copied();

        expect.soft(await overflowAtTheLargestText(page), path).toEqual([]);
      });
    }
  });
}

const { longestWordKeptWithAOneLetterWord: LONGEST_KEPT_WORD } = JSON.parse(
  readFileSync(join(__dirname, '..', 'scripts', 'one-letter-word-limit.json'), 'utf8'),
) as { longestWordKeptWithAOneLetterWord: number };

function shownSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return shownSources(path);
    }
    if (entry.name.endsWith('.html')) {
      return [readFileSync(path, 'utf8')];
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      return [
        ...readFileSync(path, 'utf8').matchAll(/\$localize`:@@[^:]+:((?:[^`\\]|\\.)*)`/g),
      ].map((message) => message[1]);
    }
    return [];
  });
}

const MEASURED_PUBLIC_PAGES = [
  '/',
  '/o-nas',
  '/prispet',
  '/zasady-ochrany-osobnich-udaju',
  connectionRequest,
];

const MEASURED_ADMIN_PAGES = [
  '/sprava',
  '/sprava/platby',
  '/sprava/darci',
  '/sprava/zalohy',
  '/sprava/nastaveni',
  '/sprava/lide-fondu',
  '/sprava/logy',
];

const MEASURED_ADMIN_TABLES = [
  '/sprava',
  '/sprava/platby',
  '/sprava/darci',
  PETR_DETAIL_PATH,
  '/sprava/prehledy',
];

const MEASURED_PLACES = [
  ...[...MEASURED_PUBLIC_PAGES, ...MEASURED_ADMIN_PAGES].map((path) => ({ path, width: 320 })),
  ...MEASURED_ADMIN_TABLES.flatMap((path) => [900, 1000].map((width) => ({ path, width }))),
];

test.describe(`Given the longest word a one-letter word keeps beside it, ${LONGEST_KEPT_WORD} letters in scripts/one-letter-word-limit.json, with the text at 200 % on a phone 320 pt wide and on a computer 900 and 1000 px wide`, () => {
  test.describe.configure({ mode: 'serial' });

  const pairs = oneLetterWordPairs(shownSources(join(__dirname, '..', 'src', 'app')));
  const measured = new Map<string, LongestKeptWord>();

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, donorWithDonations);
    await mockConnectApi(page);
    await mockAdministration(page);
    await serveEmptyAdministrationCopy(page);
  });

  for (const { path, width } of MEASURED_PLACES) {
    test(`when ${path.split('?')[0]} is measured ${width} px wide, then the longest word whose group fits each of its lines, table headers and cells, badges and pill buttons is recorded`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await rememberedSession(page);
      if (path.startsWith('/sprava')) {
        const copied = whenAdministrationCopied(page);
        await page.goto(path);
        await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
        await copied();
      } else {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      }
      if (path === PETR_DETAIL_PATH) {
        await expect(page.locator('main td').first()).toBeVisible();
        await expect(
          page.locator('main .receipts-table .pdf-button__layer--current .pdf-button__label'),
        ).toBeVisible();
      }
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.evaluate(() => document.fonts.ready);

      let previous: LongestKeptWord | undefined;
      let longest: LongestKeptWord | undefined;
      await expect
        .poll(async () => {
          previous = longest;
          longest = await longestKeptWord(page, pairs);
          return (
            previous !== undefined &&
            previous.letters === longest.letters &&
            previous.binding === longest.binding
          );
        })
        .toBe(true);
      measured.set(`${path.split('?')[0]} @ ${width} px`, longest!);

      expect(longest!.places).toBeGreaterThanOrEqual(0);
    });
  }

  test(`when every page is measured, then ${LONGEST_KEPT_WORD} letters is the longest word whose group fits the narrowest line`, () => {
    const narrowest = [...measured.entries()].reduce((least, entry) =>
      entry[1].letters < least[1].letters ? entry : least,
    );
    const report = [...measured.entries()]
      .map(([place, longest]) => `${place}: ${longest.letters} letters, ${longest.binding}`)
      .join('\n');

    expect(measured.size).toBe(MEASURED_PLACES.length);
    expect(narrowest[1].letters, report).toBe(LONGEST_KEPT_WORD);
  });
});

for (const width of [390, 1280]) {
  test.describe(`Given a visitor ${width} px wide whose segments, tabs and list sections reserve the width of their bold label`, () => {
    test.use({ viewport: { width, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await serveEmptyAdministrationCopy(page);
    });

    for (const path of ['/', '/prispet', '/sprava', '/sprava/platby', PETR_DETAIL_PATH]) {
      test(`when ${path} shows a label kept together by a no-break space, then its bold reserve is exactly as wide as the label`, async ({
        page,
      }) => {
        await rememberedSession(page);
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        expect(await boldReservesApartFromTheirLabel(page)).toEqual([]);
      });
    }
  });
}

async function textPastTheSides(
  frame: Locator,
  { ellipsis }: { ellipsis: 'past' | 'within' } = { ellipsis: 'past' },
): Promise<string[]> {
  await frame.evaluate(() => document.fonts.ready);
  return frame.evaluate((element, ellipsizedTextStaysWithin) => {
    const box = element.getBoundingClientRect();
    const left = box.left + element.clientLeft;
    const right = left + element.clientWidth;
    const past: string[] = [];
    const ellipsized = (text: Node): boolean => {
      for (
        let ancestor = text.parentElement;
        ancestor && ancestor !== element;
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor);
        if (style.textOverflow === 'ellipsis' && style.overflowX !== 'visible') {
          return true;
        }
      }
      return false;
    };
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (
        !node.textContent?.trim() ||
        node.parentElement?.closest('.visually-hidden') ||
        (ellipsizedTextStaysWithin && ellipsized(node))
      ) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && (rect.left < left - 1 || rect.right > right + 1)) {
          past.push(
            `"${node.textContent.trim().slice(0, 30)}" ${Math.round(rect.left)}..${Math.round(rect.right)} in ${Math.round(left)}..${Math.round(right)}`,
          );
          break;
        }
      }
    }
    return past;
  }, ellipsis === 'within');
}

async function rowTitlesNarrowerThanTheirLongestWord(rows: Locator): Promise<string[]> {
  await rows.first().evaluate(() => document.fonts.ready);
  return rows.evaluateAll((elements) =>
    elements.flatMap((row) => {
      const title = row.querySelector<HTMLElement>(':scope > .ui-list__title');
      if (!title || title.getClientRects().length === 0) {
        return [];
      }
      const rowStyle = getComputedStyle(row);
      const beside = Array.from(
        row.querySelectorAll<Element>(':scope > :is(.ui-list__lead, .ui-list__chevron)'),
      ).reduce((sum, part) => {
        const style = getComputedStyle(part);
        return (
          sum +
          part.getBoundingClientRect().width +
          parseFloat(style.marginInlineStart) +
          parseFloat(style.marginInlineEnd)
        );
      }, 0);
      const room =
        row.clientWidth -
        parseFloat(rowStyle.paddingInlineStart) -
        parseFloat(rowStyle.paddingInlineEnd) -
        beside;
      const style = getComputedStyle(title);
      const longest = Math.max(
        ...(title.textContent ?? '')
          .split(/\s+/)
          .filter((word) => word.length > 0)
          .map((word) => {
            const probe = document.createElement('span');
            probe.textContent = word;
            probe.style.font = style.font;
            probe.style.letterSpacing = style.letterSpacing;
            probe.style.whiteSpace = 'nowrap';
            probe.style.position = 'absolute';
            document.body.append(probe);
            const width = probe.getBoundingClientRect().width;
            probe.remove();
            return width;
          }),
      );
      const width = title.getBoundingClientRect().width;
      return width < Math.min(longest, room) - 1
        ? [
            `${(title.textContent ?? '').trim()} ${Math.round(width)} < ${Math.round(longest)} in ${Math.round(room)}`,
          ]
        : [];
    }),
  );
}

async function titlesOverTheirValues(rows: Locator): Promise<string[]> {
  await rows.first().evaluate(() => document.fonts.ready);
  return rows.evaluateAll((elements) =>
    elements.flatMap((row) => {
      const title = row.querySelector(':scope > .ui-list__title');
      const value = row.querySelector(':scope > .ui-list__value');
      if (!title || !value) {
        return [];
      }
      const rectsOf = (part: Element): DOMRect[] => {
        const range = document.createRange();
        range.selectNodeContents(part);
        return Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
      };
      const valueRects = rectsOf(value);
      const overlaps = rectsOf(title).some((text) =>
        valueRects.some(
          (other) =>
            text.left < other.right - 1 &&
            other.left < text.right - 1 &&
            text.top < other.bottom - 1 &&
            other.top < text.bottom - 1,
        ),
      );
      return overlaps
        ? [`${(title.textContent ?? '').trim()}: ${(value.textContent ?? '').trim()}`]
        : [];
    }),
  );
}

async function wordsBrokenThatWouldFit(element: Locator): Promise<string[]> {
  await element.evaluate(() => document.fonts.ready);
  return element.evaluate((root) => {
    const style = getComputedStyle(root);
    const line =
      root.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
    const broken: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const word of (node.textContent ?? '').matchAll(/[^ \t\r\n-]+-?/g)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const tops = new Set(
          Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
        );
        if (tops.size < 2) {
          continue;
        }
        const probe = document.createElement('span');
        probe.textContent = word[0];
        probe.style.font = style.font;
        probe.style.letterSpacing = style.letterSpacing;
        probe.style.whiteSpace = 'nowrap';
        probe.style.position = 'absolute';
        document.body.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        if (width <= line) {
          broken.push(`${word[0]} ${Math.round(width)} in ${line}`);
        }
      }
    }
    return broken;
  });
}

async function linesOfText(element: Locator): Promise<string[]> {
  await element.evaluate(() => document.fonts.ready);
  return element.evaluate((root) => {
    const lines: { top: number; bottom: number; text: string }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index++) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if (!rect || rect.height === 0) {
          continue;
        }
        const middle = (rect.top + rect.bottom) / 2;
        const line = lines.find(({ top, bottom }) => top <= middle && middle <= bottom);
        if (line) {
          line.text += text[index];
          line.top = Math.min(line.top, rect.top);
          line.bottom = Math.max(line.bottom, rect.bottom);
        } else {
          lines.push({ top: rect.top, bottom: rect.bottom, text: text[index] });
        }
      }
    }
    return lines
      .sort((first, second) => first.top - second.top)
      .map(({ text }) => text.trim())
      .filter((text) => text.length > 0);
  });
}

async function controlsOverTheirLabels(rows: Locator): Promise<string[]> {
  await rows.first().evaluate(() => document.fonts.ready);
  return rows.evaluateAll((elements) =>
    elements.flatMap((row) => {
      const label = row.querySelector('dt');
      if (!label) {
        return [];
      }
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      return Array.from(row.querySelectorAll<HTMLElement>(':scope > dd > button'))
        .filter((button) => button.getClientRects().length > 0)
        .filter((button) => {
          const control = button.getBoundingClientRect();
          return (
            control.left < text.right - 1 &&
            text.left < control.right - 1 &&
            control.top < text.bottom - 1 &&
            text.top < control.bottom - 1
          );
        })
        .map(
          (button) => `${(label.textContent ?? '').trim()}: ${(button.textContent ?? '').trim()}`,
        );
    }),
  );
}

async function elementsPastTheScreen(page: Page, within = 'body'): Promise<string[]> {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope) ?? document.body;
    const right = document.documentElement.clientWidth;
    const clippedFrom = (start: Element | null): boolean => {
      for (
        let ancestor = start;
        ancestor && ancestor !== document.body;
        ancestor = ancestor.parentElement
      ) {
        if (getComputedStyle(ancestor).overflowX !== 'visible') {
          return true;
        }
      }
      return false;
    };
    const elements = Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((element) => !element.closest('.visually-hidden'))
      .filter((element) => !clippedFrom(element.parentElement))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.right > right + 1)
      .filter(
        ({ element, box }) =>
          !Array.from(element.children).some(
            (child) => Math.round(child.getBoundingClientRect().right) === Math.round(box.right),
          ),
      )
      .map(({ element, box }) => {
        const name = (element.getAttribute('aria-label') ?? element.textContent ?? '')
          .trim()
          .slice(0, 30);
        return `${element.tagName.toLowerCase()}.${String(element.className).trim().replace(/\s+/g, '.')} "${name}" ..${Math.round(box.right)} in 0..${right}`;
      });
    const texts: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (
        !node.textContent?.trim() ||
        node.parentElement?.closest('.visually-hidden') ||
        clippedFrom(node.parentElement)
      ) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const reach = Math.max(0, ...Array.from(range.getClientRects()).map((rect) => rect.right));
      if (reach > right + 1) {
        texts.push(
          `text in ${node.parentElement!.tagName.toLowerCase()}.${String(node.parentElement!.className).trim().replace(/\s+/g, '.')} "${node.textContent.trim().slice(0, 30)}" ..${Math.round(reach)} in 0..${right}`,
        );
      }
    }
    const pseudos = Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((element) => !clippedFrom(element))
      .flatMap((element) =>
        (['::before', '::after'] as const)
          .filter((pseudo) => {
            const style = getComputedStyle(element, pseudo);
            if (style.content === 'none' || style.content === 'normal') {
              return false;
            }
            const box = element.getBoundingClientRect();
            const width = parseFloat(style.width) || 0;
            const fromRight = parseFloat(style.right);
            const fromLeft = parseFloat(style.left);
            const reach = !Number.isNaN(fromRight)
              ? box.right - fromRight
              : !Number.isNaN(fromLeft)
                ? box.left + fromLeft + width
                : box.right;
            return style.position === 'absolute' && reach > right + 1;
          })
          .map(
            (pseudo) =>
              `${element.tagName.toLowerCase()}.${String(element.className).trim().replace(/\s+/g, '.')}${pseudo}`,
          ),
      );
    return [...elements, ...texts, ...pseudos];
  }, within);
}

async function pageWiderThanTheScreen(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

for (const { width, height } of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test.describe(`Given a donor on an iPhone ${width} pt wide whose installed app shows the largest accessibility text, on their account`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page }) => {
      await showLargestSystemText(page);
    });

    test('when they open Údaje a zabezpečení with its passkeys open, then no text reaches past its card, no button covers its label, a heading breaks inside a word only when the word is wider than its line and no date breaks inside a number', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donors/me/passkeys',
        (route) =>
          route.fulfill({
            json: {
              items: [
                {
                  id: '019a1b2c-3d4e-7f00-8000-000000000001',
                  name: 'iPhone',
                  createdAt: '2026-10-17T10:00:00Z',
                  lastUsedAt: '2026-10-22T09:00:00Z',
                },
              ],
            },
          }),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Údaje a zabezpečení');
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Spravovat přístupové klíče' }).click();
      const passkeys = page.getByRole('region', { name: 'Přístupové klíče' });
      await expect(passkeys.getByText('naposledy použito')).toBeVisible();
      await expect(page.locator('.device-last-use').first()).toBeVisible();
      const cards = page.locator('main .ui-card');

      await expect.poll(() => elementsPastTheScreen(page)).toEqual([]);
      await expect.poll(() => pageWiderThanTheScreen(page)).toBeLessThanOrEqual(0);
      for (const card of await cards.all()) {
        expect(await textPastTheSides(card)).toEqual([]);
        expect(await contentPastTheSides(card)).toEqual([]);
        expect(await numbersSplitAcrossLines(card)).toEqual([]);
      }
      for (const heading of await page.locator('main h2').all()) {
        expect(await wordsBrokenThatWouldFit(heading)).toEqual([]);
      }
      expect(await controlsOverTheirLabels(page.locator('main .account-row'))).toEqual([]);
    });

    test('when they open Bankovní účty with a verified account and press Přidat bankovní účet, then no account number or other text reaches past the sheet and no account number breaks inside', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) => route.fulfill({ json: { items: [bankAccountItem()] } }),
      );
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-check',
        (route) =>
          route.fulfill({
            status: 202,
            json: { bankDataAsOf: '2026-10-18T08:05:30Z', checking: false },
          }),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Bankovní účty');
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();
      const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
      await expect(dialog.locator('.add-account-verified')).toContainText('2900233333/2010');
      await expect(dialog.locator('.add-account-bank')).toContainText('5544332217/2010');
      const panel = dialog.locator('.dialog-panel');

      expect(await textPastTheSides(panel)).toEqual([]);
      expect(await contentPastTheSides(panel)).toEqual([]);
      for (const value of [
        dialog.locator('.add-account-verified'),
        dialog.locator('.add-account-bank .bank-value').first(),
      ]) {
        expect(await numbersSplitAcrossLines(value)).toEqual([]);
      }
    });
  });

  test.describe(`Given an administrator on an iPhone ${width} pt wide whose installed app shows the largest accessibility text`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page }) => {
      await showLargestSystemText(page);
    });

    test('when they open a paired payment, then the sender account number and every other text of Přiřazená platba stay within the sheet', async ({
      page,
    }) => {
      const { column } = await openPairedPayment(page);
      const panel = column.locator('.dialog-panel');
      await expect(panel.locator('app-bank-account').first()).toBeVisible();

      expect(await textPastTheSides(panel)).toEqual([]);
      expect(await contentPastTheSides(panel)).toEqual([]);
      expect(await numbersSplitAcrossLines(panel.locator('app-bank-account').first())).toEqual([]);
    });

    test('when they open the account sheet, then no row title is narrower than its longest word, jen správci stays clear of Správa, the name breaks only between words and no text reaches past its group', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await rememberedDonorSession(page, { user: administrator });
      await page.goto('/darce/prehled');
      const sheet = await showAccountList(page);
      const administration = sheet.locator('.account-administration .ui-list__row');
      await expect(administration.getByText('jen správci')).toBeVisible();
      await expect(sheet.locator('.account-name')).toHaveText('Jana Nováková');
      const rows = sheet.locator('.ui-list__row');

      expect(await rowTitlesNarrowerThanTheirLongestWord(rows)).toEqual([]);
      expect(await titlesOverTheirValues(rows)).toEqual([]);
      expect(await wordsBrokenInside(sheet.locator('.account-name'))).toEqual([]);
      expect(await wordsBrokenThatWouldFit(sheet.locator('.account-profile-detail'))).toEqual([]);
      for (const group of await sheet.locator('.account-profile, .ui-list--grouped').all()) {
        expect(await textPastTheSides(group, { ellipsis: 'within' })).toEqual([]);
      }
      await expect.poll(() => elementsPastTheScreen(page, 'app-account-sheet')).toEqual([]);
    });
  });

  test.describe(`Given an administrator on an iPhone ${width} pt wide whose installed app shows the largest accessibility text and whose administration is locked`, () => {
    test.use({ viewport: { width, height }, unlocksAdministration: false });

    test.beforeEach(async ({ page }) => {
      await showLargestSystemText(page);
    });

    test('when they open the administration and choose Použít heslo, then the title, the fields and the buttons of the lock card stay within the card and the screen', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await rememberedSession(page);
      await page.goto('/sprava');
      const card = page.locator('.lock-panel');
      await expect(
        card.getByRole('heading', { level: 1, name: 'Správa je zamčená' }),
      ).toBeVisible();

      for (const step of ['locked', 'password']) {
        if (step === 'password') {
          await card.getByRole('button', { name: 'Použít heslo' }).click();
          await expect(
            card.getByRole('heading', { level: 1, name: 'Odemknout heslem' }),
          ).toBeVisible();
        }
        await expect.poll(() => elementsPastTheScreen(page), step).toEqual([]);
        await expect.poll(() => pageWiderThanTheScreen(page), step).toBeLessThanOrEqual(0);
        expect(await textPastTheSides(card), step).toEqual([]);
        expect(await contentPastTheSides(card), step).toEqual([]);
      }
    });
  });
}

for (const { width, height } of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test.describe(`Given a donor on an iPhone ${width} pt wide whose installed app shows the largest accessibility text, reading the rows of their sign-in`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page }) => {
      await showLargestSystemText(page);
    });

    test('when they open Údaje a zabezpečení, then Dvoufaktorové ověření is split within its row label and reaches past neither the label nor its card', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await openDonorSection(page, 'Údaje a zabezpečení');
      await page.setViewportSize({ width, height });
      await expect(page.getByRole('navigation', { name: 'Můj účet' })).toHaveCount(0);
      const label = page.locator('main .account-row dt', { hasText: 'Dvoufaktorové' });
      await expect(label).toBeVisible();

      const lines = await linesOfText(label);
      test.info().annotations.push({ type: 'split', description: lines.join(' | ') });
      expect(await textPastTheSides(label)).toEqual([]);
      expect(await textPastTheSides(page.locator('app-account-card .ui-card'))).toEqual([]);
    });
  });

  test.describe(`Given an administrator on an iPhone ${width} pt wide whose installed app shows the largest accessibility text and who unlocks the administration with the password`, () => {
    test.use({ viewport: { width, height }, unlocksAdministration: false });

    test.beforeEach(async ({ page }) => {
      await showLargestSystemText(page);
    });

    test('when they press Odemknout and the loading delay passes, then its label is split the same way at rest and at work, stays within the button and the button keeps its height', async ({
      page,
    }) => {
      await page.clock.install();
      await mockDonorApi(page);
      await rememberedSession(page);
      const neverAnswered = new Promise<void>(() => undefined);
      await page.route(
        (url) => url.pathname === ADMINISTRATION_UNLOCK_PATH,
        async () => neverAnswered,
      );
      await page.goto('/sprava');
      const card = page.locator('.lock-panel');
      await card.getByRole('button', { name: 'Použít heslo' }).click();
      await card.locator('#zamek-heslo').fill('correct horse battery');
      await card.locator('#zamek-kod').fill('123456');
      const unlock = card.locator('.lock-unlock');
      await expect(unlock).toBeVisible();
      const resting = {
        height: (await unlock.boundingBox())!.height,
        lines: await linesOfText(unlock.locator('.busy-label__face--shown')),
        past: await textPastTheSides(unlock),
      };

      await unlock.click();
      await page.clock.fastForward(1_000);
      await expect(unlock.locator('.busy-label__face--shown')).toHaveText('Odemykáme…');
      const working = {
        height: (await unlock.boundingBox())!.height,
        lines: await linesOfText(unlock.locator('.busy-label__face--shown')),
        past: await textPastTheSides(unlock),
      };

      test
        .info()
        .annotations.push(
          { type: 'split at rest', description: resting.lines.join(' | ') },
          { type: 'split at work', description: working.lines.join(' | ') },
        );
      expect(resting.past).toEqual([]);
      expect(working.past).toEqual([]);
      expect(Math.abs(working.height - resting.height)).toBeLessThanOrEqual(1);
    });
  });
}

for (const rootSize of ['200%', `${LARGEST_SYSTEM_TEXT_PX}px`]) {
  test.describe(`Given a computer window 900 px wide whose root text is ${rootSize}`, () => {
    test.use({ viewport: { width: 900, height: 900 } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((size) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `html { font-size: ${size}; }`;
          document.head.append(style);
        });
      }, rootSize);
    });

    test('when a donor opens Údaje a zabezpečení, then every card title breaks only between words', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await signIn(page);
      await openDonorSection(page, 'Údaje a zabezpečení');
      const titles = page.locator('main .ui-card__title');
      await expect(titles.first()).toBeVisible();

      for (const title of await titles.all()) {
        expect(await wordsBrokenInside(title), await title.innerText()).toEqual([]);
      }
    });

    for (const { path, heading } of [
      { path: '/sprava/upozorneni', heading: 'Upozornění' },
      { path: '/sprava/zalohy/historie', heading: 'Všechny zálohy' },
      { path: '/sprava/prehledy/2026-09', heading: 'Přehled za září 2026' },
      { path: `${PETR_DETAIL_PATH}/udaje`, heading: null },
    ]) {
      test(`when an administrator opens ${path}, then every card title breaks only between words`, async ({
        page,
      }) => {
        await mockDonorApi(page, donorWithDonations);
        await mockAdministration(page);
        await rememberedSession(page);
        await page.goto(path);
        if (heading) {
          await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        }
        const titles = page.locator('main .ui-card__title');
        await expect(titles.first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        for (const title of await titles.all()) {
          expect(await wordsBrokenInside(title), await title.innerText()).toEqual([]);
        }
      });
    }
  });
}

async function cardTitlesBelowTheirFullSize(page: Page): Promise<string[]> {
  const titles = page.locator('main .ui-card__title');
  await expect(titles.first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const below: string[] = [];
  for (const title of await titles.all()) {
    if (!(await title.isVisible())) {
      continue;
    }
    const { title: size, token } = await fontSizes(title, '--text-2xl');
    if (Math.abs(size - token) > 0.5) {
      below.push(`${(await title.innerText()).trim()}: ${size} px, --text-2xl ${token} px`);
    }
  }
  return below;
}

interface CardsBesideEachOther {
  besideEachOther: number;
  measured: number;
  changed: string[];
}

async function cardsBesideEachOtherWithoutTheCardContainer(
  page: Page,
): Promise<CardsBesideEachOther> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('main .ui-card')].filter((card) =>
      card.checkVisibility(),
    );
    const measure = () =>
      cards.map((card) => {
        const box = card.getBoundingClientRect();
        return { left: box.left, top: box.top, width: box.width, height: box.height };
      });
    const withContainer = measure();
    const beside = cards
      .map((_, index) => index)
      .filter((index) =>
        withContainer.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            Math.abs(other.top - withContainer[index].top) <= 1 &&
            (other.left >= withContainer[index].left + withContainer[index].width - 1 ||
              other.left + other.width <= withContainer[index].left + 1),
        ),
      );
    const newContainers = cards.filter(
      (card) => getComputedStyle(card).containerName === 'ui-card',
    );
    for (const card of newContainers) {
      card.style.setProperty('container-type', 'normal', 'important');
    }
    const withoutContainer = measure();
    for (const card of newContainers) {
      card.style.removeProperty('container-type');
    }
    const compared = beside.length > 0 ? beside : newContainers.map((card) => cards.indexOf(card));
    const changed = compared
      .filter(
        (index) =>
          Math.abs(withContainer[index].width - withoutContainer[index].width) > 0.5 ||
          Math.abs(withContainer[index].height - withoutContainer[index].height) > 0.5,
      )
      .map((index) => {
        const title = cards[index].querySelector('.ui-card__title')?.textContent?.trim() ?? '';
        const [now, before] = [withContainer[index], withoutContainer[index]];
        return `${title}: ${now.width.toFixed(1)}×${now.height.toFixed(1)}, without the container ${before.width.toFixed(1)}×${before.height.toFixed(1)}`;
      });
    return { besideEachOther: beside.length, measured: compared.length, changed };
  });
}

for (const width of [1280, 1920]) {
  for (const rootSize of [null, '200%']) {
    test.describe(`Given a computer window ${width} px wide whose root text is ${rootSize ?? 'the default size'}`, () => {
      test.use({ viewport: { width: 1280, height: 900 } });

      test.beforeEach(async ({ page }) => {
        if (rootSize) {
          await page.addInitScript((size) => {
            document.addEventListener('DOMContentLoaded', () => {
              const style = document.createElement('style');
              style.textContent = `html { font-size: ${size}; }`;
              document.head.append(style);
            });
          }, rootSize);
        }
      });

      test('when a donor opens Údaje a zabezpečení, then every card title takes --text-2xl', async ({
        page,
      }) => {
        await mockDonorApi(page);
        await signIn(page);
        await page.setViewportSize({ width, height: 900 });
        await openDonorSection(page, 'Údaje a zabezpečení');
        await expect(page).toHaveURL(/\/darce\/udaje$/);

        expect(await cardTitlesBelowTheirFullSize(page)).toEqual([]);
      });

      test('when an administrator opens Správa, then every card title takes --text-2xl and the cards beside each other, or every card container when none are, keep the width and height they have without the card container, as on main', async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await mockDonorApi(page, donorWithDonations);
        await mockAdministration(page);
        await rememberedSession(page);
        await page.goto('/sprava');
        await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeVisible();
        await expect(page.locator('main .admin-status > .ui-card')).toHaveCount(2);

        expect(await cardTitlesBelowTheirFullSize(page)).toEqual([]);
        const cards = await cardsBesideEachOtherWithoutTheCardContainer(page);
        test.info().annotations.push({
          type: 'cards beside each other',
          description: `${cards.besideEachOther}, measured ${cards.measured}`,
        });
        if (!rootSize) {
          expect(cards.besideEachOther).toBeGreaterThanOrEqual(2);
        }
        expect(cards.measured).toBeGreaterThanOrEqual(1);
        expect(cards.changed).toEqual([]);
      });
    });
  }
}

async function wrappedOntoMoreLines(elements: Locator): Promise<string[]> {
  await elements.first().evaluate(() => document.fonts.ready);
  return elements.evaluateAll((list) =>
    list
      .filter((element) => {
        const probe = document.createElement('span');
        probe.textContent = '0';
        probe.style.display = 'inline-block';
        probe.style.whiteSpace = 'nowrap';
        element.after(probe);
        const line = probe.getBoundingClientRect().height;
        probe.remove();
        return element.getBoundingClientRect().height > line * 1.5;
      })
      .map((element) => (element.textContent ?? '').trim()),
  );
}

test.describe('Given an administrator on a computer 1280 px wide with the text at its default size, reading account numbers and dates', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, donorWithDonations);
    await mockAdministration(page);
    await rememberedSession(page);
  });

  test('when they open /sprava/starsi-symboly, then every account number stays on one line', async ({
    page,
  }) => {
    await page.goto('/sprava/starsi-symboly');
    const numbers = page.locator('main table app-bank-account .ui-figures');
    await expect(numbers.first()).toBeVisible();

    expect(await wrappedOntoMoreLines(numbers)).toEqual([]);
  });

  test('when they open the bank accounts of a donor, then every date of their last gift stays whole', async ({
    page,
  }) => {
    await page.goto(`${PETR_DETAIL_PATH}/bankovni-ucty`);
    const dates = page.locator('main td .muted', { hasText: 'poslední' }).locator('.ui-date');
    await expect(dates.first()).toBeVisible();

    expect(await wrappedOntoMoreLines(dates)).toEqual([]);
  });
});

test.describe('Given a donor on an iPhone 390 pt wide with the text at its default size', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('when they open Údaje a zabezpečení, then the date and the time of every signed-in device stay together on one line', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('navigation', { name: 'Můj účet' })).toHaveCount(0);
    const dates = page.locator('app-devices-card .device-date-value');
    await expect(dates.first()).toBeVisible();

    expect(await wrappedOntoMoreLines(dates)).toEqual([]);
  });
});

test.describe('Given a phone 320 pt wide with the text at its default size', () => {
  test.use({ viewport: { width: 320, height: 568 }, unlocksAdministration: false });

  test('when a donor with a verified account opens Přidat bankovní účet, then no word of the sheet breaks inside', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) => route.fulfill({ json: { items: [bankAccountItem()] } }),
    );
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-check',
      (route) =>
        route.fulfill({
          status: 202,
          json: { bankDataAsOf: '2026-10-18T08:05:30Z', checking: false },
        }),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();
    const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
    await expect(dialog.locator('.watch-detail')).toBeVisible();

    for (const text of await dialog.locator('.watch-title, .watch-detail').all()) {
      expect(await wordsBrokenInside(text)).toEqual([]);
    }
  });

  test('when an administrator opens the locked administration and its password view, then no word of the lock card breaks inside', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
    await page.goto('/sprava');
    const card = page.locator('.lock-panel');
    await expect(card.getByRole('heading', { level: 1, name: 'Správa je zamčená' })).toBeVisible();

    for (const step of ['locked', 'password']) {
      if (step === 'password') {
        await card.getByRole('button', { name: 'Použít heslo' }).click();
        await expect(
          card.getByRole('heading', { level: 1, name: 'Odemknout heslem' }),
        ).toBeVisible();
      }
      for (const text of await card.locator('.lock-lead, .lock-note, .ui-button').all()) {
        expect(await wordsBrokenInside(text), step).toEqual([]);
      }
    }
  });
});
