import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { bankAccountItem, mockDonorApi, openAccountItem, signIn } from './donor-session';

const FACTS_MAXIMUM_HEIGHT = 300;

async function signInOnPhone(page: Page, width: number): Promise<void> {
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) => route.fulfill({ json: { items: [bankAccountItem()] } }),
  );
  await signIn(page);
  await page.setViewportSize({ width, height: 800 });
}

test.describe('Given a signed-in donor adding a bank account on a phone', () => {
  for (const width of [375, 390]) {
    test(`when Přidat bankovní účet opens ${width} px wide, then the payment facts keep their natural height with no gap between them wider than the facts' own`, async ({
      page,
    }) => {
      await signInOnPhone(page, width);
      await openAccountItem(page, 'Bankovní účty');
      await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();

      const facts = page
        .getByRole('dialog', { name: 'Přidat bankovní účet' })
        .locator('.add-account-bank');
      await expect(facts.locator('.add-account-row')).toHaveCount(4);
      const measured = await facts.evaluate((list) => {
        const rows = Array.from(list.querySelectorAll('.add-account-row'));
        const valueTop = (row: Element) => {
          const range = document.createRange();
          range.selectNodeContents(row.querySelector('.bank-value')!);
          return Math.min(...Array.from(range.getClientRects(), (rect) => rect.top));
        };
        return {
          height: list.getBoundingClientRect().height,
          allowedGap: parseFloat(getComputedStyle(list).rowGap),
          labelToValue: rows.map(
            (row) => valueTop(row) - row.querySelector('dt')!.getBoundingClientRect().bottom,
          ),
          gaps: rows
            .slice(1)
            .map(
              (row, index) =>
                row.querySelector('dt')!.getBoundingClientRect().top -
                rows[index].getBoundingClientRect().bottom,
            ),
        };
      });

      expect(measured.height).toBeLessThanOrEqual(FACTS_MAXIMUM_HEIGHT);
      for (const gap of measured.labelToValue) {
        expect(Math.abs(gap - measured.labelToValue[0])).toBeLessThanOrEqual(1);
        expect(gap).toBeLessThanOrEqual(measured.allowedGap + 1);
      }
      for (const gap of measured.gaps) {
        expect(gap).toBeLessThanOrEqual(measured.allowedGap + 1);
      }
    });
  }
});

test.describe('Given a signed-in donor on a phone whose home-screen app sets a 17 px root', () => {
  test('when Údaje a zabezpečení opens in the account sheet 375 px wide, then every row title of Přihlášení a zabezpečení keeps to one line beside its button', async ({
    page,
  }) => {
    await signInOnPhone(page, 375);
    await page.addStyleTag({ content: 'html { font-size: 17px; }' });
    await openAccountItem(page, 'Údaje a zabezpečení');

    const titles = page.locator('.account-row dt');
    await expect(titles).toHaveText([
      'E-mail',
      'Heslo',
      'Dvoufaktorové ověření',
      'Přístupové klíče',
    ]);
    const lines = await titles.evaluateAll((found) =>
      found.map((title) => {
        const range = document.createRange();
        range.selectNodeContents(title);
        return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
      }),
    );
    expect(lines).toEqual([1, 1, 1, 1]);
  });
});
