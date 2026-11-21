import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  bankAccountItem,
  mockDonorApi,
  openAccountItem,
  openDonorSection,
  signIn,
} from './donor-session';

const ACCOUNTS = [
  bankAccountItem({
    id: '0192f0c4-0000-7000-8000-000000000001',
    accountNumber: '2900233333/2010',
    donationCount: 1,
    totalAmountMinor: 200,
  }),
  bankAccountItem({
    id: '0192f0c4-0000-7000-8000-000000000002',
    accountNumber: '000019-2000145399/0710',
    shared: true,
  }),
  bankAccountItem({
    id: '0192f0c4-0000-7000-8000-000000000003',
    accountNumber: '123-7092740277/0100',
  }),
  bankAccountItem({
    id: '0192f0c4-0000-7000-8000-000000000004',
    accountNumber: '1011121314/5500',
    status: 'DISCONNECTED',
    disconnectedOn: '2025-06-30',
    donationCount: 2,
    totalAmountMinor: 60000,
  }),
];

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
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) => route.fulfill({ json: { items: ACCOUNTS } }),
  );
  await signIn(page);
  await page.setViewportSize({ width, height: 800 });
}

async function openBankAccounts(page: Page, width: number): Promise<Locator> {
  await signInOnPhone(page, width);
  await openAccountItem(page, 'Bankovní účty');
  const rows = page.locator('.account');
  await expect(rows).toHaveCount(ACCOUNTS.length);
  return rows;
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

    test(`when Bankovní účty lists numbers of every length in the account sheet ${width} px wide, then every badge stands in the same place under its number`, async ({
      page,
    }) => {
      const rows = await openBankAccounts(page, width);

      const placed = await rows.evaluateAll((found) =>
        found.map((row) => {
          const number = row.querySelector('.account-number')!.getBoundingClientRect();
          const badge = row.querySelector('.account-status')!.getBoundingClientRect();
          return {
            below: badge.top >= number.bottom - 0.5,
            left: Math.round(badge.left - number.left),
          };
        }),
      );
      expect(placed.filter((each) => !each.below)).toEqual([]);
      expect(new Set(placed.map((each) => each.left))).toEqual(new Set([0]));
    });

    test(`when Bankovní účty shows a switched-off account with gifts in the account sheet ${width} px wide, then the count of its gifts and their total stay on one line`, async ({
      page,
    }) => {
      const rows = await openBankAccounts(page, width);

      const gifts = rows.nth(3).locator('.account-gifts');
      await expect(gifts).toContainText('2 dary bez symbolu');
      await expect(gifts).toContainText('600');
      const tops = await gifts.evaluate((item) =>
        [item.querySelector('.account-gift-count')!, item.querySelector('.account-total')!].map(
          (part) => Math.round(part.getBoundingClientRect().top),
        ),
      );
      expect(new Set(tops).size).toBe(1);
    });

    test(`when Bankovní účty offers its actions and the warning of a shared account in the account sheet ${width} px wide, then each starts on the row's edge under the bank mark and every action label keeps to one line`, async ({
      page,
    }) => {
      const rows = await openBankAccounts(page, width);

      const actions = page.locator('.account-action');
      await expect(actions.first()).toBeVisible();
      expect(new Set(await linesOf(actions))).toEqual(new Set([1]));
      const offsets = await rows.evaluateAll((found) =>
        found.flatMap((row) => {
          const lead = row.querySelector('.account-lead')!.getBoundingClientRect();
          return Array.from(row.querySelectorAll('.account-action, .account-hint--warning')).map(
            (part) => Math.round(part.getBoundingClientRect().left - lead.left),
          );
        }),
      );
      expect(offsets.length).toBeGreaterThan(0);
      expect(new Set(offsets)).toEqual(new Set([0]));
    });

    test(`when Přidat bankovní účet opens ${width} px wide, then its copy buttons stand in one column at the right edge and every value sits as far under its label`, async ({
      page,
    }) => {
      await openBankAccounts(page, width);
      await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();

      const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
      const rows = dialog.locator('.add-account-row');
      await expect(rows).toHaveCount(4);
      const placed = await rows.evaluateAll((found) =>
        found.map((row) => {
          const label = row.querySelector('dt')!.getBoundingClientRect();
          const value = row.querySelector('.bank-value')!;
          const range = document.createRange();
          range.selectNodeContents(value);
          const text = range.getClientRects()[0];
          const button = row.querySelector('app-copy-button button')?.getBoundingClientRect();
          return {
            gap: Math.round(text.top - label.bottom),
            buttonEnd: button ? Math.round(button.right) : null,
            buttonStart: button ? Math.round(button.left) : null,
          };
        }),
      );
      const buttons = placed.filter((each) => each.buttonEnd !== null);
      expect(buttons).toHaveLength(3);
      expect(new Set(buttons.map((each) => each.buttonEnd)).size).toBe(1);
      expect(new Set(buttons.map((each) => each.buttonStart)).size).toBe(1);
      expect(new Set(placed.map((each) => each.gap)).size).toBe(1);
    });
  }
});

test.describe('Given a signed-in donor adding a bank account on a wide screen', () => {
  for (const width of [820, 1280]) {
    test(`when Přidat bankovní účet opens ${width} px wide, then the QR code starts level with the first payment fact`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await signIn(page);
      await page.setViewportSize({ width, height: 900 });
      await openDonorSection(page, 'Bankovní účty');
      await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();

      const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
      const qr = dialog.locator('.add-account-qr');
      const facts = dialog.locator('.add-account-bank');
      await expect(facts).toBeVisible();
      const [qrBox, factsBox] = [(await qr.boundingBox())!, (await facts.boundingBox())!];
      expect(Math.abs(qrBox.y - factsBox.y)).toBeLessThanOrEqual(1);
    });
  }
});
