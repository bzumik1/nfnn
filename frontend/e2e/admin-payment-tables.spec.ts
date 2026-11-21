import type { Locator, Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
  servePetrBankAccounts,
} from './baseline/screen-mocks';
import { bankAccountItem, mockDonorApi } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const WIDTHS = [1280, 1000, 900] as const;
const LONG_MESSAGE = 'Dar na podporu rodin s dětmi po léčbě, děkujeme za vaši práci a pomoc';
const LONG_DONOR_NAME = 'Marie Josefína Dvořáková-Procházková';

function payment(index: number, overrides: Record<string, unknown>) {
  const suffix = String(index).padStart(4, '0');
  return {
    id: `019a1c00-0000-7000-8000-00000000${suffix}`,
    version: `0123456789ab${suffix}`,
    bankTransactionId: 3000 + index,
    bookedOn: '2026-10-20',
    amountMinor: 50000,
    currency: 'CZK',
    variableSymbol: '1111111111',
    counterpartyAccount: '2900233333/2010',
    counterpartyName: 'Nováková Jana',
    messageForRecipient: 'Dar',
    importedAt: '2026-10-20T10:00:00Z',
    unpairedByAdminAt: null,
    accountVerification: false,
    donation: null,
    ...overrides,
  };
}

const UNPAIRED = [
  payment(1, {
    amountMinor: 125000050,
    counterpartyAccount: '000019-2000145399/0800',
    counterpartyName: 'Spolek přátel dětské onkologie Ústí nad Labem',
    messageForRecipient: LONG_MESSAGE,
  }),
  payment(2, {
    amountMinor: 100,
    accountVerification: true,
    counterpartyAccount: '670100-2212345678/6210',
    counterpartyName: 'Procházková Marie Josefína',
    variableSymbol: null,
  }),
  payment(3, {
    amountMinor: 4200000,
    counterpartyAccount: '2400123456/2010',
    unpairedByAdminAt: '2026-10-21T10:00:00Z',
  }),
  payment(4, {
    amountMinor: 123456789,
    counterpartyAccount: '000123-0123456789/0100',
    counterpartyName: 'Dvořák Jan',
    messageForRecipient: null,
  }),
  payment(5, { amountMinor: 250000, counterpartyAccount: '19-2000145399/0800' }),
  payment(6, { amountMinor: 30000, counterpartyAccount: null, counterpartyName: null }),
  payment(7, {
    amountMinor: 999900,
    counterpartyAccount: '35-4567890123/0300',
    messageForRecipient: 'Na Vánoce pro děti',
  }),
];

const PAIRED = UNPAIRED.map((item, index) => ({
  ...item,
  id: `019a1c00-0000-7000-8000-00000001${String(index).padStart(4, '0')}`,
  unpairedByAdminAt: null,
  accountVerification: false,
  donation: {
    id: `0192f0f1-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`,
    donorId: '01a18e56-bdb0-775a-bd0a-a6075683e011',
    donorName: index === 0 ? LONG_DONOR_NAME : 'Petr Svoboda',
    pairedBy: 'VARIABLE_SYMBOL',
    status: 'RECEIVED',
    recordedAt: '2026-10-20T09:00:00Z',
    receiptIssued: index % 2 === 0,
  },
}));

const CLAIMS = [
  {
    id: '019a1c00-0000-7000-8000-00000000c001',
    donorId: '01a18e56-bdb0-775a-bd0a-a6075683e011',
    donorName: LONG_DONOR_NAME,
    account: '000019-2000145399/0800',
    variableSymbol: '6123456789',
    answer: 'CONFIRMED',
    answeredAt: '2026-10-20T09:00:00Z',
    donationCount: 3,
  },
  {
    id: '019a1c00-0000-7000-8000-00000000c002',
    donorId: '019a1c00-0000-7000-8000-00000000a002',
    donorName: 'Petr Svoboda',
    account: '670100-2212345678/6210',
    variableSymbol: '777',
    answer: 'DECLINED',
    answeredAt: '2026-10-19T08:30:00Z',
    donationCount: 0,
  },
];

async function openAdministration(page: Page, width: number, path: string): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await mockDonorApi(page, donorWithDonations);
  await rememberedSession(page);
  await mockAdministration(page);
  await page.route(
    (url) => url.pathname === '/api/admin/donations/payments',
    (route) => {
      const paired = new URL(route.request().url()).searchParams.get('pairing') === 'paired';
      const items = paired ? PAIRED : UNPAIRED;
      return route.fulfill({
        json: { year: null, availableYears: [2026], items, total: items.length },
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/admin/donations/symbol-claims',
    (route) => route.fulfill({ json: { items: CLAIMS } }),
  );
  await servePetrBankAccounts(page, [
    bankAccountItem({ accountNumber: '000019-2000145399/0800', donationCount: 2 }),
    bankAccountItem({
      id: '0192f0c4-0000-7000-8000-000000000002',
      accountNumber: '670100-2212345678/6210',
      shared: true,
      pairingExcluded: true,
    }),
  ]);
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function logosOffTheirNumberLine(table: Locator): Promise<string[]> {
  return table.evaluate((element) =>
    [...element.querySelectorAll('app-bank-account')].flatMap((account) => {
      const logo = account.querySelector('app-bank-logo');
      const number = account.querySelector('.number .ui-figures');
      if (!logo || !number) {
        return [];
      }
      const mark = logo.getBoundingClientRect();
      const firstLine = number.getClientRects()[0];
      const shared = Math.min(mark.bottom, firstLine.bottom) - Math.max(mark.top, firstLine.top);
      return shared > 0
        ? []
        : [
            `${number.textContent}: logo ${Math.round(mark.top)}..${Math.round(mark.bottom)}, number's first line ${Math.round(firstLine.top)}..${Math.round(firstLine.bottom)}`,
          ];
    }),
  );
}

async function pastItsFrame(table: Locator): Promise<number> {
  return table.evaluate((element) => {
    const frame = (element.closest('.ui-table-frame') ?? element).getBoundingClientRect();
    return Math.max(0, Math.round(element.getBoundingClientRect().right - frame.right));
  });
}

async function wordsSplitAcrossLines(locator: Locator): Promise<string[]> {
  return locator.evaluate((element) => {
    const split: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const word of (node.textContent ?? '').matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const tops = new Set<number>();
        for (const box of range.getClientRects()) {
          if (box.width > 0) {
            tops.add(Math.round(box.top));
          }
        }
        if (tops.size > 1) {
          split.push(word[0]);
        }
      }
    }
    return split;
  });
}

async function linesOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set<number>();
    for (const box of range.getClientRects()) {
      if (box.width > 0) {
        tops.add(Math.round(box.top));
      }
    }
    return tops.size;
  });
}

async function amountRightEdges(table: Locator): Promise<Record<string, number>> {
  return table.evaluate((element) =>
    Object.fromEntries(
      [...element.querySelectorAll<HTMLElement>('tbody td.amount .ui-amount')].map((amount) => [
        amount.textContent ?? '',
        Math.round(amount.getBoundingClientRect().right),
      ]),
    ),
  );
}

for (const width of WIDTHS) {
  test.describe(`Given an administrator at ${width} px with production-like payments`, () => {
    test('when they read the waiting payments, then every bank logo stands on the line of its account number', async ({
      page,
    }) => {
      await openAdministration(page, width, '/sprava/platby');

      expect(await logosOffTheirNumberLine(page.locator('.payments-card table'))).toEqual([]);
    });

    test('when they read the waiting payments, then the 1 Kč verification ends where the other amounts end', async ({
      page,
    }) => {
      await openAdministration(page, width, '/sprava/platby');
      const table = page.locator('.payments-card table');
      await expect(table.getByText('Ověření účtu')).toBeVisible();

      const edges = await amountRightEdges(table);

      expect(new Set(Object.values(edges)).size, JSON.stringify(edges)).toBe(1);
    });

    test('when they read the waiting payments, then a long message to the recipient takes at most three lines', async ({
      page,
    }) => {
      await openAdministration(page, width, '/sprava/platby');

      expect(await linesOf(page.locator('.payments-card .message').first())).toBeLessThanOrEqual(3);
    });

    test('when they read the paired payments, then every bank logo stands on the line of its account number', async ({
      page,
    }) => {
      await openAdministration(page, width, '/sprava/platby');
      await page.getByRole('button', { name: 'Přiřazené' }).click();
      await expect(page.getByRole('columnheader', { name: 'Dárce' })).toBeVisible();

      expect(await logosOffTheirNumberLine(page.locator('.payments-card table'))).toEqual([]);
    });

    test('when they read the older symbols, then the donor name takes at most two lines and every bank logo stands on the line of its account number', async ({
      page,
    }) => {
      await openAdministration(page, width, '/sprava/starsi-symboly');
      const table = page.locator('table');

      expect(await linesOf(table.getByRole('link', { name: LONG_DONOR_NAME }))).toBeLessThanOrEqual(
        2,
      );
      expect(await logosOffTheirNumberLine(table)).toEqual([]);
    });

    test('when they switch between the waiting and the paired payments, then each table stays inside its card', async ({
      page,
    }) => {
      await openAdministration(page, width, '/sprava/platby');
      const table = page.locator('.payments-card table');

      expect(await pastItsFrame(table)).toBe(0);
      await page.getByRole('button', { name: 'Přiřazené' }).click();
      await expect(page.getByRole('columnheader', { name: 'Dárce' })).toBeAttached();
      expect(await pastItsFrame(table)).toBe(0);
    });

    test("when they read a donor's bank accounts, then every bank logo stands on the line of its account number", async ({
      page,
    }) => {
      await openAdministration(page, width, PETR_DETAIL_PATH);

      const table = page.locator('table', { has: page.locator('app-bank-account') });
      await expect(table).toBeVisible();
      expect(await logosOffTheirNumberLine(table)).toEqual([]);
    });
  });
}

for (const width of [1000, 900] as const) {
  test.describe(`Given an administrator at ${width} px, where payments stand as cards`, () => {
    test('when a long message stands beside the sender, then the sender keeps room for their name and account', async ({
      page,
    }) => {
      await openAdministration(page, width, '/sprava/platby');
      const firstPayment = page.locator('.payments-card tbody tr').first();

      expect(await linesOf(firstPayment.locator('.sender-name'))).toBeLessThanOrEqual(2);
      expect(await linesOf(firstPayment.locator('.sender-account .number .ui-figures'))).toBe(1);
    });
  });
}

const OLDER_SYMBOL_ACTIONS = ['Vrátit přiřazení darů', 'Zeptat se dárce znovu'] as const;

test.describe('Given an administrator at 1280 px reading the older symbols', () => {
  for (const name of OLDER_SYMBOL_ACTIONS) {
    test(`when the action „${name}“ stands in its column, then its label takes at most two lines`, async ({
      page,
    }) => {
      await openAdministration(page, 1280, '/sprava/starsi-symboly');

      expect(await linesOf(page.getByRole('button', { name }))).toBeLessThanOrEqual(2);
    });

    test(`when the text is 200 %, then no word of the action „${name}“ is broken inside`, async ({
      page,
    }) => {
      await openAdministration(page, 1280, '/sprava/starsi-symboly');
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      const button = page.getByRole('button', { name });
      await expect(button).toBeVisible();

      expect(await wordsSplitAcrossLines(button)).toEqual([]);
    });
  }
});

for (const { width, rootPx } of [
  { width: 1180, rootPx: null },
  { width: 1280, rootPx: 20 },
] as const) {
  const setting = rootPx === null ? `${width} px` : `${width} px with a ${rootPx} px root`;
  test.describe(`Given an administrator at ${setting}`, () => {
    async function openAt(page: Page, path: string): Promise<void> {
      await openAdministration(page, width, path);
      if (rootPx !== null) {
        await page.addStyleTag({ content: `html { font-size: ${rootPx}px; }` });
      }
    }

    test('when they switch between the waiting and the paired payments, then each table stays inside its card', async ({
      page,
    }) => {
      await openAt(page, '/sprava/platby');
      const table = page.locator('.payments-card table');

      expect(await pastItsFrame(table)).toBe(0);
      await page.getByRole('button', { name: 'Přiřazené' }).click();
      await expect(page.getByRole('columnheader', { name: 'Dárce' })).toBeAttached();
      expect(await pastItsFrame(table)).toBe(0);
    });

    test('when they read the older symbols, then the table stays inside its card', async ({
      page,
    }) => {
      await openAt(page, '/sprava/starsi-symboly');

      expect(await pastItsFrame(page.locator('table'))).toBe(0);
    });
  });
}

async function badgesPastTheirCells(table: Locator): Promise<string[]> {
  return table.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('td .ui-badge')].flatMap((badge) => {
      const cell = badge.closest('td')!;
      const style = getComputedStyle(cell);
      const box = cell.getBoundingClientRect();
      const left = box.left + parseFloat(style.paddingLeft);
      const right = box.right - parseFloat(style.paddingRight);
      const mark = badge.getBoundingClientRect();
      return mark.left < left - 0.5 || mark.right > right + 0.5
        ? [
            `${badge.textContent?.trim()}: ${Math.round(mark.left)}..${Math.round(mark.right)} in ${Math.round(left)}..${Math.round(right)}`,
          ]
        : [];
    }),
  );
}

for (const { width, rootSize } of [
  { width: 1280, rootSize: '22px' },
  { width: 1800, rootSize: '200%' },
] as const) {
  test.describe(`Given an administrator at ${width} px with the root text at ${rootSize}, where payments are still a table`, () => {
    test('when they switch between the waiting and the paired payments, then every badge stays inside its cell', async ({
      page,
    }) => {
      await openAdministration(page, width, '/sprava/platby');
      await page.addStyleTag({ content: `html { font-size: ${rootSize}; }` });
      const table = page.locator('.payments-card table');
      await expect(table.getByText('Ověření účtu')).toBeVisible();

      expect(await badgesPastTheirCells(table)).toEqual([]);
      await page.getByRole('button', { name: 'Přiřazené' }).click();
      await expect(page.getByRole('columnheader', { name: 'Dárce' })).toBeAttached();
      await expect(table.locator('td .ui-badge').first()).toBeVisible();
      expect(await badgesPastTheirCells(table)).toEqual([]);
    });
  });
}
