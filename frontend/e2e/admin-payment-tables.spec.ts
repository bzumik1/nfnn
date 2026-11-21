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
const ONE_WORD_DONOR_NAME = 'Severomoravskáenergetickáspolečnost';

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

async function openAdministration(
  page: Page,
  width: number,
  path: string,
  claims: readonly object[] = CLAIMS,
): Promise<void> {
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
    (route) => route.fulfill({ json: { items: claims } }),
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

async function namesPastTheirCell(table: Locator): Promise<string[]> {
  return table.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('tbody .claim-donor')].flatMap((name) => {
      const cell = name.closest('td')!;
      const style = getComputedStyle(cell);
      const box = cell.getBoundingClientRect();
      const right = box.right - parseFloat(style.paddingRight);
      const range = document.createRange();
      range.selectNodeContents(name);
      const textRight = Math.max(...[...range.getClientRects()].map((line) => line.right));
      return textRight > right + 0.5
        ? [
            `${name.textContent?.trim()}: text ends at ${Math.round(textRight)}, cell at ${Math.round(right)}`,
          ]
        : [];
    }),
  );
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
    async function openAt(page: Page, path: string, claims = CLAIMS): Promise<void> {
      await openAdministration(page, width, path, claims);
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

    test('when a donor name is one long word, then the name stays inside its cell', async ({
      page,
    }) => {
      await openAt(page, '/sprava/starsi-symboly', [
        { ...CLAIMS[0], donorName: ONE_WORD_DONOR_NAME },
        CLAIMS[1],
      ]);
      await expect(page.getByRole('link', { name: ONE_WORD_DONOR_NAME })).toBeVisible();

      expect(await namesPastTheirCell(page.locator('table'))).toEqual([]);
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

const LARGEST_SYSTEM_TEXT_PX = 53;

async function openRows(
  page: Page,
  viewport: { width: number; height: number },
  path: string,
  rootPx: number | null = null,
): Promise<void> {
  if (rootPx !== null) {
    await page.addInitScript((px) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `html { font-size: ${px}px; }`;
        document.head.append(style);
      });
    }, rootPx);
  }
  await page.setViewportSize(viewport);
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
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await expect(page.locator('button.payment-row').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function factsPastTheirCell(facts: Locator): Promise<string[]> {
  return facts.evaluate((list) =>
    [...list.querySelectorAll<HTMLElement>(':scope > div')].flatMap((cell) => {
      const frame = cell.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(cell);
      return [...range.getClientRects()]
        .filter(
          (box) => box.width > 0 && (box.left < frame.left - 1 || box.right > frame.right + 1),
        )
        .map(
          (box) =>
            `${cell.querySelector('dt')?.textContent?.trim()}: ${Math.round(box.left)}..${Math.round(box.right)} in ${Math.round(frame.left)}..${Math.round(frame.right)}`,
        );
    }),
  );
}

async function linesOfText(within: Locator, text: string): Promise<number> {
  return within.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = (node.textContent ?? '').indexOf(wanted);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + wanted.length);
        return new Set(
          [...range.getClientRects()]
            .filter((box) => box.width > 0)
            .map((box) => Math.round(box.top)),
        ).size;
      }
    }
    return 0;
  }, text);
}

async function sideways(panel: Locator): Promise<number> {
  return panel.evaluate((element) => element.scrollWidth - element.clientWidth);
}

for (const viewport of [
  { width: 420, height: 912 },
  { width: 820, height: 1180 },
]) {
  test.describe(`Given an administrator ${viewport.width} pt wide at the largest text, reading a payment's sheet`, () => {
    test('when they open a paired payment, then every fact stays within its own cell, the sender keeps the words of the name whole and the sheet never pans sideways', async ({
      page,
    }) => {
      await openRows(page, viewport, '/sprava/platby?stav=prirazene', LARGEST_SYSTEM_TEXT_PX);
      await page.locator('button.payment-row').first().click();
      const sheet = page.getByRole('dialog', { name: 'Přiřazená platba' });
      await expect(sheet.getByText('potvrzení vystaveno')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const facts = sheet.locator('.pair-payment');

      expect(await factsPastTheirCell(facts)).toEqual([]);
      for (const word of String(PAIRED[0].counterpartyName).split(' ')) {
        expect(await linesOfText(facts, word), word).toBe(1);
      }
      expect(await sideways(sheet.locator('.dialog-panel'))).toBeLessThanOrEqual(0);
    });

    test('when they open a waiting payment to pair it, then every fact stays within its own cell and the dialog never pans sideways', async ({
      page,
    }) => {
      await openRows(page, viewport, '/sprava/platby', LARGEST_SYSTEM_TEXT_PX);
      await page.locator('button.payment-row').first().click();
      const dialog = page.getByRole('dialog', { name: 'Přiřadit platbu dárci' });
      const facts = dialog.locator('.pair-payment');
      await expect(facts).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      expect(await factsPastTheirCell(facts)).toEqual([]);
      expect(await sideways(dialog.locator('.dialog-panel'))).toBeLessThanOrEqual(0);
    });
  });
}

test.describe('Given an administrator on an iPad upright pairing a payment with a long message', () => {
  test('when the pairing dialog shows the facts, then the symbol and message take the whole width of the facts box', async ({
    page,
  }) => {
    await openRows(page, { width: 820, height: 1180 }, '/sprava/platby');
    await page.locator('button.payment-row').first().click();
    const facts = page
      .getByRole('dialog', { name: 'Přiřadit platbu dárci' })
      .locator('.pair-payment');
    await expect(facts.getByText(LONG_MESSAGE)).toBeVisible();

    const widths = await facts.evaluate((list) => {
      const style = getComputedStyle(list);
      const content =
        list.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const message = [...list.querySelectorAll(':scope > div')].at(-1)!;
      return {
        content: Math.round(content),
        message: Math.round(message.getBoundingClientRect().width),
      };
    });
    expect(widths.message).toBe(widths.content);
  });
});

async function amountsOffTheFirstLine(rows: Locator): Promise<string[]> {
  return rows.evaluateAll((buttons) =>
    buttons.flatMap((row) => {
      const title = row.querySelector('.ui-list__title')!;
      const value = row.querySelector('.ui-list__value')!;
      const range = document.createRange();
      range.selectNodeContents(title);
      const first = range.getClientRects()[0];
      const amount = value.getBoundingClientRect();
      const offset = amount.top + amount.height / 2 - (first.top + first.height / 2);
      return Math.abs(offset) > 3 ? [`${value.textContent?.trim()}: ${Math.round(offset)} px`] : [];
    }),
  );
}

async function titleToMetaGaps(rows: Locator): Promise<number[]> {
  return rows.evaluateAll((buttons) =>
    buttons.map((row) => {
      const title = row.querySelector('.ui-list__title')!.getBoundingClientRect();
      const meta = row.querySelector('.ui-list__meta')!.getBoundingClientRect();
      return Math.round(meta.top - title.bottom);
    }),
  );
}

test.describe('Given an administrator on an iPad upright reading Platby z banky as rows beside their amounts', () => {
  test('when the rows have one, two or three lines and one carries a badge, then every amount stands on the first line of its row and every date sits as close under its name', async ({
    page,
  }) => {
    await openRows(page, { width: 820, height: 1180 }, '/sprava/platby');
    const rows = page.locator('button.payment-row');
    await expect(rows.filter({ hasText: 'Ověření účtu' })).toBeVisible();

    expect(await amountsOffTheFirstLine(rows)).toEqual([]);
    expect(new Set(await titleToMetaGaps(rows)).size).toBe(1);
  });
});

test.describe('Given an administrator on an iPad in landscape at the largest text, scrolling Platby z banky', () => {
  test('when the month heading sticks, then it rests at the top of the screen with no row of its month above it', async ({
    page,
  }) => {
    await openRows(page, { width: 1180, height: 820 }, '/sprava/platby', LARGEST_SYSTEM_TEXT_PX);
    const heading = page.locator('.ui-list__group-title').first();
    const start = await heading.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    await page.evaluate((top) => window.scrollTo(0, top + 400), start);
    await expect
      .poll(() => heading.evaluate((element) => element.parentElement!.getBoundingClientRect().top))
      .toBeLessThan(0);

    await expect
      .poll(() => heading.evaluate((element) => Math.round(element.getBoundingClientRect().top)))
      .toBe(0);
  });
});
