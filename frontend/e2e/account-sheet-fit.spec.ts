import { Locator, Page } from '@playwright/test';
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
        const lineCount = (row: Element) => {
          const range = document.createRange();
          range.selectNodeContents(row.querySelector('.bank-value')!);
          return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
        };
        return {
          oneLineValueHeights: rows
            .filter((row) => lineCount(row) === 1)
            .map((row) => row.querySelector('dd')!.getBoundingClientRect().height),
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
      expect(measured.oneLineValueHeights.length).toBeGreaterThan(1);
      expect(
        Math.max(...measured.oneLineValueHeights) - Math.min(...measured.oneLineValueHeights),
      ).toBeLessThanOrEqual(1);
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

function scrollTopAfterTwoFrames(panel: Locator): Promise<number> {
  return panel.evaluate(
    (element) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(element.scrollTop))),
      ),
  );
}

test.describe('Given a signed-in donor who has scrolled Údaje a zabezpečení in the account sheet 390 px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('when the focus moves from a control below up to Zpět and then to Zavřít in the sheet head, then the sheet stays where it was scrolled', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await signIn(page);
    await openAccountItem(page, 'Údaje a zabezpečení');
    const sheet = page.getByRole('dialog', { name: 'Údaje a zabezpečení' });
    const head = sheet.locator('app-sheet-head');
    const panel = sheet.locator(':scope > .dialog-panel');
    await expect(head).toBeVisible();
    await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
    await panel.evaluate((element) => element.scrollTo(0, 400));
    await expect.poll(() => scrollTopAfterTwoFrames(panel)).toBeGreaterThan(0);
    const focusedBelow = await panel.evaluate((element) => {
      const headBottom = element.querySelector('app-sheet-head')!.getBoundingClientRect().bottom;
      const panelBottom = element.getBoundingClientRect().bottom;
      const below = Array.from(element.querySelectorAll<HTMLElement>('button, a[href]')).find(
        (control) => {
          const box = control.getBoundingClientRect();
          return (
            control.closest('app-sheet-head') === null &&
            box.height > 0 &&
            box.top > headBottom + 24 &&
            box.bottom < panelBottom - 24
          );
        },
      );
      below?.focus();
      return below !== undefined && document.activeElement === below;
    });
    expect(focusedBelow).toBe(true);
    const scrolled = await scrollTopAfterTwoFrames(panel);

    for (const name of ['Zpět', 'Zavřít']) {
      const control = head.getByRole('button', { name, exact: true });
      await control.focus();
      await expect(control).toBeFocused();
      await expect.poll(() => scrollTopAfterTwoFrames(panel)).toBeCloseTo(scrolled, 0);
    }
  });
});
