import type { Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
} from './baseline/screen-mocks';
import {
  administrationCopyGift,
  administrator,
  mockDonorApi,
  serveAdministrationCopy,
  whenAdministrationCopied,
} from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const HEIGHT = 900;
const WIDTHS = [900, 1000, 1280] as const;
const TOLERANCE = 0.5;

interface LongDonor {
  readonly donorId: string;
  readonly name: string;
  readonly type: 'PERSON' | 'COMPANY';
  readonly email: string;
  readonly variableSymbol: string;
  readonly account: string;
  readonly bookedOn: string;
  readonly amountMinor: number;
}

const LONG_DONORS: readonly LongDonor[] = [
  {
    donorId: administrator.id,
    name: 'Bohumila Kateřina Novotná-Procházková',
    type: 'PERSON',
    email: 'bohumila.katerina.novotna-prochazkova@nejdelsi-domena-ceske-republiky.cz',
    variableSymbol: '1234567890',
    account: '000019-2000145399/0800',
    bookedOn: '2026-10-24',
    amountMinor: 123456789,
  },
  {
    donorId: '01a18e56-bdb0-775a-bd0a-a6075683e001',
    name: 'Společenství vlastníků jednotek Nábřeží Kapitána Jaroše 1928/14',
    type: 'COMPANY',
    email: 'predseda.vyboru.spolecenstvi@svj-nabrezi-kapitana-jarose.example.cz',
    variableSymbol: '9876543210',
    account: '670100-2213456789/6210',
    bookedOn: '2026-10-18',
    amountMinor: 9999900,
  },
  {
    donorId: '01a18e56-bdb0-775a-bd0a-a6075683e002',
    name: 'Maximilián Vojtěch Šťastný z Lichtenštejnů',
    type: 'PERSON',
    email: 'maximilian.vojtech.stastny.z.lichtenstejnu@seznam-dlouhych-adres.cz',
    variableSymbol: '5550001112',
    account: '123456-1234567890/2700',
    bookedOn: '2026-10-09',
    amountMinor: 500000,
  },
];

const WAITING_PAYMENT = {
  id: '019a1c00-0000-7000-8000-00000000f100',
  bookedOn: '2026-10-26',
  amountMinor: 4200000,
  variableSymbol: '0000000001',
  counterpartyAccount: '000099-9999999999/0300',
  counterpartyName: 'Nadační fond přátel Krušnohorských luk a pastvin, z. ú.',
  messageForRecipient: 'Příspěvek na letní tábor pro děti z dětského domova v Krásné Lípě',
};

function payment(
  id: string,
  fields: Pick<
    typeof WAITING_PAYMENT,
    'bookedOn' | 'amountMinor' | 'variableSymbol' | 'counterpartyAccount' | 'counterpartyName'
  > & { messageForRecipient: string | null },
) {
  return {
    id,
    version: `0123456789ab${id.slice(-4)}`,
    bankTransactionId: Number.parseInt(id.slice(-4), 16),
    currency: 'CZK',
    importedAt: `${fields.bookedOn}T10:00:00Z`,
    unpairedByAdminAt: null,
    accountVerification: false,
    ...fields,
  };
}

function paymentOf(donor: LongDonor, index: number) {
  return payment(`019a1c00-0000-7000-8000-00000000f00${index}`, {
    bookedOn: donor.bookedOn,
    amountMinor: donor.amountMinor,
    variableSymbol: donor.variableSymbol,
    counterpartyAccount: donor.account,
    counterpartyName: donor.name,
    messageForRecipient: 'Dar na provoz fondu a na rekonstrukci klubovny v Ústí nad Labem',
  });
}

function recordOf(donor: LongDonor) {
  return {
    donorId: donor.donorId,
    name: donor.name,
    type: donor.type,
    variableSymbol: donor.variableSymbol,
    companyIdentifier: donor.type === 'COMPANY' ? '12345678' : null,
    address: {
      street: 'Nábřeží Kapitána Jaroše 1928/14',
      city: 'Ústí nad Labem-Střekov',
      postalCode: '400 03',
    },
    preferredLocale: 'cs',
    registeredAt: '2026-01-15T10:00:00Z',
    erasedAt: null,
  };
}

function accountOf(donor: LongDonor) {
  return {
    ...recordOf(donor),
    email: donor.email,
    emailVerified: true,
    administrator: donor.donorId === administrator.id,
    secondFactorEnabled: true,
    passkeys: 0,
  };
}

async function serveCopyOfLongDonors(page: Page): Promise<void> {
  const payments = LONG_DONORS.map(paymentOf);
  await serveAdministrationCopy(page, {
    donations: {
      'payments:2026-10': [payment(WAITING_PAYMENT.id, WAITING_PAYMENT), ...payments],
      'donations:2026-10': LONG_DONORS.map((donor, index) =>
        administrationCopyGift(
          payments[index].id,
          donor.donorId,
          donor.bookedOn,
          donor.amountMinor,
        ),
      ),
      'donor-records:2026-01': LONG_DONORS.map(recordOf),
    },
    donors: { 'accounts:2026-01': LONG_DONORS.map(accountOf) },
  });
}

interface TablePage {
  readonly name: string;
  readonly path: string;
  readonly administration: boolean;
  readonly open?: (page: Page) => Promise<void>;
}

const PAGES: readonly TablePage[] = [
  { name: 'Platby', path: '/sprava/platby', administration: true },
  {
    name: 'Přiřazené platby',
    path: '/sprava/platby',
    administration: true,
    open: (page) => page.getByRole('button', { name: 'Přiřazené', exact: true }).click(),
  },
  { name: 'Dárci', path: '/sprava/darci', administration: true },
  { name: 'karta dárce', path: PETR_DETAIL_PATH, administration: true },
  { name: 'Starší symboly', path: '/sprava/starsi-symboly', administration: true },
  { name: 'Historie', path: '/sprava/historie', administration: true },
  { name: 'přehled', path: '/sprava', administration: true },
  { name: 'Projekty', path: '/sprava/projekty', administration: true },
  { name: 'Aktuality', path: '/sprava/aktuality', administration: true },
  { name: 'Můj přehled', path: '/darce/prehled', administration: false },
  { name: 'Moje dary', path: '/darce/dary', administration: false },
  { name: 'Potvrzení o daru', path: '/darce/potvrzeni', administration: false },
];

interface Overflow {
  readonly what: string;
  readonly by: number;
}

async function openPage(page: Page, target: TablePage): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await rememberedSession(page);
  if (target.administration) {
    await mockAdministration(page);
    await serveCopyOfLongDonors(page);
    const copied = whenAdministrationCopied(page);
    await page.goto(target.path);
    await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
    await copied();
  } else {
    await page.goto(target.path);
  }
  await target.open?.(page);
  await expect(page.locator('main table').first()).toBeVisible();
  await expect(page.locator('main table tbody tr').first()).toBeVisible();
}

async function overflowsOfTheirCards(page: Page): Promise<Overflow[]> {
  return page.locator('main').evaluate((main, tolerance) => {
    const found: { what: string; by: number }[] = [];
    for (const table of Array.from(main.querySelectorAll('table'))) {
      const card = table.closest('.ui-card');
      if (card === null) {
        continue;
      }
      const edge = card.getBoundingClientRect();
      const inner = {
        left: edge.left + card.clientLeft,
        right: edge.left + card.clientLeft + card.clientWidth,
      };
      const measured = [
        { what: 'table', box: table.getBoundingClientRect() },
        ...Array.from(table.querySelectorAll('button, a')).map((control) => ({
          what: `${control.tagName.toLowerCase()} "${(control.textContent ?? '').trim()}"`,
          box: control.getBoundingClientRect(),
        })),
      ];
      for (const { what, box } of measured) {
        if (box.width === 0) {
          continue;
        }
        const by = Math.max(inner.left - box.left, box.right - inner.right);
        if (by > tolerance) {
          found.push({ what, by: Math.round(by * 10) / 10 });
        }
      }
    }
    return found;
  }, TOLERANCE);
}

async function pansSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

interface BrokenText {
  readonly text: string;
  readonly lines: number;
}

async function textsOnMoreThanOneLine(page: Page, selector: string): Promise<BrokenText[]> {
  return page.locator('main table').evaluateAll(
    (tables, wanted) =>
      tables
        .flatMap((table) => Array.from(table.querySelectorAll(wanted)))
        .map((element) => ({
          text: (element.textContent ?? '').trim(),
          lines: new Set(
            Array.from(element.getClientRects())
              .filter(({ width }) => width > 0)
              .map(({ top }) => Math.round(top)),
          ).size,
        }))
        .filter(({ lines }) => lines > 1),
    selector,
  );
}

test.describe('Given the donors listed with long names and e-mails on a computer', () => {
  const donors = PAGES.find(({ path }) => path === '/sprava/darci')!;

  for (const width of [1280, 1920]) {
    test(`when Dárci opens at ${width} px, then every e-mail breaks at most right after its @`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await openPage(page, donors);

      await expect(page.locator('main table .email').first()).toBeVisible();
      expect(await textsOnMoreThanOneLine(page, '.email-part')).toEqual([]);
      await expect.poll(() => overflowsOfTheirCards(page)).toEqual([]);
      expect(await pansSideways(page)).toBe(false);
    });
  }

  test('when Dárci opens at 1920 px, then it stays a table whose header Variabilní symbol reads on one line', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: HEIGHT });
    await openPage(page, donors);

    const header = page.getByRole('main').getByRole('columnheader', { name: 'Variabilní symbol' });
    await expect(header).toBeVisible();
    await expect(page.locator('main table thead')).not.toHaveCSS('position', 'absolute');
    expect(await textsOnMoreThanOneLine(page, 'th')).toEqual([]);
  });
});

test.describe('Given a page whose table sits in a card on a computer', () => {
  for (const target of PAGES) {
    test(`when ${target.name} opens at 900, 1000 and 1280 px, then its table and every action stay wholly inside the card`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: WIDTHS[WIDTHS.length - 1], height: HEIGHT });
      await openPage(page, target);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        await expect
          .poll(() => overflowsOfTheirCards(page), { message: `${width} px` })
          .toEqual([]);
        expect(await pansSideways(page)).toBe(false);
      }
    });
  }

  test('when the older symbols open at 1280 px with 200 % text, then the answers and their actions stay inside the card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    await openPage(
      page,
      PAGES.find(({ path }) => path === '/sprava/starsi-symboly')!,
    );
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

    await expect.poll(() => overflowsOfTheirCards(page)).toEqual([]);
    expect(await pansSideways(page)).toBe(false);
  });

  test('when the older symbols fold into cards at 900 px, then a screen reader still finds a table with its cells', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: HEIGHT });
    await openPage(
      page,
      PAGES.find(({ path }) => path === '/sprava/starsi-symboly')!,
    );

    const table = page.getByRole('main').getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead')).toHaveCSS('position', 'absolute');
    await expect(table.getByRole('cell').first()).toBeVisible();
    await expect(table.getByRole('row')).not.toHaveCount(0);
  });
});
