import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openAccountItem, signIn } from './donor-session';

async function linesOf(elements: Locator): Promise<number[]> {
  return elements.evaluateAll((found) =>
    found.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    }),
  );
}

async function signInOnPhone(page: Page, width: number): Promise<void> {
  await mockDonorApi(page);
  await signIn(page);
  await page.setViewportSize({ width, height: 800 });
}

test.describe('Given a signed-in donor on a phone', () => {
  for (const width of [375, 420]) {
    test(`when Údaje a zabezpečení opens in the account sheet ${width} px wide, then every row title of Přihlášení a zabezpečení keeps to one line beside its button`, async ({
      page,
    }) => {
      await signInOnPhone(page, width);
      await openAccountItem(page, 'Údaje a zabezpečení');

      const titles = page.locator('.account-row dt');
      await expect(titles).toHaveText([
        'E-mail',
        'Heslo',
        'Dvoufaktorové ověření',
        'Přístupové klíče',
      ]);
      expect(await linesOf(titles)).toEqual([1, 1, 1, 1]);
    });
  }
});
