import { Locator, Page } from '@playwright/test';
import { DIAGNOSTICS, logsApi, routeLogsApi } from './admin-logs-api';
import { LOGO_IMAGE_ID, mockBankLogos } from './bank-logos';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
  renamePetr,
} from './baseline/screen-mocks';
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

  for (const { path, heading, cards } of [
    { path: '/sprava/upozorneni', heading: 'Upozornění', cards: 'main' },
    { path: '/sprava/zalohy/historie', heading: 'Všechny zálohy', cards: 'main' },
    { path: '/sprava/prehledy/2026-09', heading: 'Přehled za září 2026', cards: 'main' },
    { path: PETR_DETAIL_PATH, heading: 'Petr Svoboda', cards: 'main nav.card-rows' },
  ]) {
    test(`when they open ${path}, then every card title and row breaks only between words or after a hyphen and no card reaches past the screen`, async ({
      page,
    }) => {
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
});

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
