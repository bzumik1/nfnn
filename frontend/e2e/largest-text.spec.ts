import { Locator, Page } from '@playwright/test';
import { LOGO_IMAGE_ID, mockBankLogos } from './bank-logos';
import {
  administrator,
  bankAccountItem,
  donationItem,
  mockDonorApi,
  noDonations,
  openDonorSection,
  rememberedDonorSession,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';
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
        card.getByRole('link', { name: 'Přidat účet, ze kterého jste platili' }),
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
      const glyph = (await close.locator('span').boundingBox())!;
      expect(glyph.x).toBeGreaterThanOrEqual(button.x - 1);
      expect(glyph.x + glyph.width).toBeLessThanOrEqual(button.x + button.width + 1);
      expect(await contentPastTheSides(dialog)).toEqual([]);
    });
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
