import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  bankAccountItem,
  donor,
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

async function numbersBrokenAcrossLines(dialog: Locator): Promise<string[]> {
  return dialog.locator('.add-account-bank').evaluate((facts) => {
    const broken: string[] = [];
    const walker = document.createTreeWalker(facts, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const number of (node.textContent ?? '').matchAll(/[\d/-]{4,}/g)) {
        const range = document.createRange();
        range.setStart(node, number.index);
        range.setEnd(node, number.index + number[0].length);
        const tops = new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top)));
        if (tops.size > 1) {
          broken.push(number[0]);
        }
      }
    }
    return broken;
  });
}

async function copyButtonsOffTheRightEdge(dialog: Locator): Promise<string[]> {
  return dialog.locator('.add-account-row').evaluateAll((rows) =>
    rows.flatMap((row) => {
      const button = row.querySelector('app-copy-button button');
      if (!button) {
        return [];
      }
      const edge = row.querySelector('dd')!.getBoundingClientRect().right;
      return Math.abs(button.getBoundingClientRect().right - edge) > 1
        ? [row.querySelector('dt')!.textContent!.trim()]
        : [];
    }),
  );
}

const DONOR_WITH_A_LONG_ADDRESS = {
  ...donor,
  address: {
    street: 'Dlouhá ulice u Starého nádraží 1234/56a',
    city: 'Ústí nad Labem-Severní Terasa',
    postalCode: '400 11',
  },
};

async function signInOnPhone(page: Page, width: number, user: typeof donor = donor): Promise<void> {
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) => route.fulfill({ json: { items: ACCOUNTS } }),
  );
  await signIn(page, user);
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

    test(`when Údaje a zabezpečení shows a long address in the account sheet ${width} px wide, then the postal code and the town start the line after the street and the postal code never splits`, async ({
      page,
    }) => {
      await signInOnPhone(page, width, DONOR_WITH_A_LONG_ADDRESS);
      await openAccountItem(page, 'Údaje a zabezpečení');

      const parts = page.locator('.profile-address-part');
      await expect(parts).toHaveCount(2);
      const placed = await parts.evaluateAll(([street, locality]) => {
        const postalCode = document.createRange();
        postalCode.setStart(locality.firstChild!, 0);
        postalCode.setEnd(locality.firstChild!, '400 11'.length);
        const lineTops = (range: Range) =>
          new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
        return {
          localityBelowStreet:
            locality.getBoundingClientRect().top >= street.getBoundingClientRect().bottom - 0.5,
          postalCodeLines: lineTops(postalCode),
        };
      });
      expect(placed).toEqual({ localityBelowStreet: true, postalCodeLines: 1 });
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

    test(`when copying a payment fact fails in Přidat bankovní účet ${width} px wide, then the failure message takes its own line under the value and the value keeps its width`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error('Clipboard refused')) },
        });
      });
      await openBankAccounts(page, width);
      await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();

      const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
      const row = dialog
        .locator('.add-account-row')
        .filter({ has: page.locator('app-copy-button') })
        .first();
      const copy = row.locator('app-copy-button');
      await copy.getByRole('button').click();
      await expect(copy).toHaveClass(/has-failed/);

      const placed = await row.evaluate((found) => {
        const value = found.querySelector('.bank-value')!.getBoundingClientRect();
        const failure = found.querySelector('app-copy-button')!.getBoundingClientRect();
        return { valueWidth: value.width, valueBottom: value.bottom, failureTop: failure.top };
      });
      expect(placed.valueWidth).toBeGreaterThan(0);
      expect(placed.failureTop).toBeGreaterThanOrEqual(placed.valueBottom);
    });
  }
});

test.describe('Given a signed-in donor adding a bank account in a narrow bottom sheet', () => {
  for (const root of [16, 17]) {
    test(`when Přidat bankovní účet opens 490 px wide with a ${root} px root, then no number breaks across lines and every copy button ends at the right edge`, async ({
      page,
    }) => {
      await signInOnPhone(page, 490);
      await page.addStyleTag({ content: `html { font-size: ${root}px; }` });
      await openAccountItem(page, 'Bankovní účty');
      await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();
      const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
      await expect(dialog.locator('.add-account-bank')).toBeVisible();

      await expect.poll(() => numbersBrokenAcrossLines(dialog)).toEqual([]);
      expect(await copyButtonsOffTheRightEdge(dialog)).toEqual([]);
    });
  }
});

test.describe('Given a signed-in donor on a phone with the largest system text', () => {
  for (const width of [375, 390]) {
    test(`when Bankovní účty lists accounts with gifts in the account sheet ${width} px wide, then each gift count starts its line whole beside its separator and no text of the row is clipped`, async ({
      page,
    }) => {
      const rows = await openBankAccounts(page, width);
      await page.addStyleTag({ content: 'html { font-size: 53px; }' });

      const gifts = rows.locator('.account-gifts');
      await expect(gifts).toHaveCount(2);
      const placed = await gifts.evaluateAll((found) =>
        found.map((item) => {
          const wrap = item.closest('.account-meta-wrap')!;
          const firstGlyph = (part: Element) => {
            const text = document
              .createTreeWalker(part, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) =>
                  node.textContent!.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
              })
              .nextNode()!;
            const start = text.textContent!.search(/\S/);
            const range = document.createRange();
            range.setStart(text, start);
            range.setEnd(text, start + 1);
            return range.getBoundingClientRect();
          };
          const wrapLeft = wrap.getBoundingClientRect().left;
          const count = item.querySelector('.account-gift-count')!;
          return {
            unclipped: wrap.scrollWidth <= wrap.clientWidth,
            countWhole: firstGlyph(count).left >= wrapLeft - 0.5,
            totalWhole: firstGlyph(item.querySelector('.account-total')!).left >= wrapLeft - 0.5,
            countOnFirstLine:
              Math.round(count.getBoundingClientRect().top) ===
              Math.round(item.getBoundingClientRect().top),
          };
        }),
      );
      expect(placed).toEqual([
        { unclipped: true, countWhole: true, totalWhole: true, countOnFirstLine: true },
        { unclipped: true, countWhole: true, totalWhole: true, countOnFirstLine: true },
      ]);
    });
  }
});

test.describe('Given a signed-in donor adding a bank account on a wide screen', () => {
  const openAddAccount = async (page: Page, width: number) => {
    await mockDonorApi(page);
    await signIn(page);
    await page.setViewportSize({ width, height: 900 });
    await openDonorSection(page, 'Bankovní účty');
    await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();
    const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
    await expect(dialog.locator('.add-account-bank')).toBeVisible();
    await expect(dialog.locator('.add-account-qr')).toBeVisible();
    return dialog;
  };

  test('when Přidat bankovní účet opens 820 px wide, then the QR code starts level with the first payment fact', async ({
    page,
  }) => {
    const dialog = await openAddAccount(page, 820);
    await expect
      .poll(
        () =>
          dialog.evaluate((sheet) => {
            const [qrTop, factsTop] = ['.add-account-qr', '.add-account-bank'].map(
              (part) => sheet.querySelector(part)!.getBoundingClientRect().top,
            );
            return Math.abs(qrTop - factsTop);
          }),
        { message: 'the QR code is level with the first payment fact once the sheet stands' },
      )
      .toBeLessThanOrEqual(1);
  });

  test('when Přidat bankovní účet opens 1280 px wide, then the payment facts stand under the QR code and no number breaks across lines', async ({
    page,
  }) => {
    const dialog = await openAddAccount(page, 1280);
    await expect
      .poll(
        () =>
          dialog.evaluate((sheet) => {
            const qrBottom = sheet.querySelector('.add-account-qr')!.getBoundingClientRect().bottom;
            const factsTop = sheet.querySelector('.add-account-bank')!.getBoundingClientRect().top;
            return factsTop - qrBottom;
          }),
        { message: 'the payment facts start under the QR code once the sheet stands' },
      )
      .toBeGreaterThanOrEqual(0);
    expect(await numbersBrokenAcrossLines(dialog)).toEqual([]);
  });

  test('when Přidat bankovní účet opens on an upright tablet with the largest system text, then no number breaks across lines and every copy button ends at the right edge', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await signIn(page);
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.addStyleTag({ content: 'html { font-size: 53px; }' });
    await openDonorSection(page, 'Bankovní účty');
    await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();
    const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
    await expect(dialog.locator('.add-account-bank')).toBeVisible();

    await expect.poll(() => numbersBrokenAcrossLines(dialog)).toEqual([]);
    expect(await copyButtonsOffTheRightEdge(dialog)).toEqual([]);
  });
});
