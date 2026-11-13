import { Locator, Page } from '@playwright/test';
import { LOGO_IMAGE_ID, mockBankLogos } from './bank-logos';
import { bankAccountItem, mockDonorApi, openDonorSection, signIn } from './donor-session';
import { expect, test } from './fixtures';

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

async function wordsSplitAcrossLines(element: Locator): Promise<string[]> {
  return element.evaluate((heading) => {
    const text = heading.firstChild!;
    return Array.from((text.textContent ?? '').matchAll(/\S+/g))
      .filter((word) => {
        const range = document.createRange();
        range.setStart(text, word.index);
        range.setEnd(text, word.index + word[0].length);
        return (
          new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size > 1
        );
      })
      .map((word) => word[0]);
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

    test('when a signed-in donor with a question about an account opens Můj přehled, then the question and Odpovědět stay whole within their row', async ({
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
      const row = page.locator('.overview-question .ui-list__row');
      await expect(row).toContainText('Odpovědět');

      await expect.poll(() => contentPastTheSides(row)).toEqual([]);
    });

    test('when a signed-in donor opens Můj přehled, then every bank detail of Poslat dar stays whole within its row', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page);
      await page.setViewportSize({ width, height });
      const rows = page.locator('.send-gift .bank-row');
      await expect(rows.last()).toContainText('IBAN');

      for (const row of await rows.all()) {
        await expect.poll(() => contentPastTheSides(row)).toEqual([]);
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
