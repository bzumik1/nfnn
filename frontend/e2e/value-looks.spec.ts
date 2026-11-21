import type { Locator, Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
} from './baseline/screen-mocks';
import {
  administrationCopyGift,
  administrator,
  bankAccountItem,
  claudeConnection,
  donationItem,
  mockDonorApi,
  openDonorSection,
  serveAdministrationCopy,
  signIn,
  whenAdministrationCopied,
} from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';
import { FOUR_DONORS, mockYearlyReceipts } from './yearly-receipts';

const WIDE = { width: 1280, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const NOTICEABLE_FILL_CONTRAST = 1.2;

interface Look {
  readonly where: string;
  readonly text: string;
  readonly look: string;
}

interface CopyDonor {
  readonly donorId: string;
  readonly name: string;
  readonly variableSymbol: string;
  readonly account: string;
  readonly amountMinor: number;
  readonly administrator: boolean;
  readonly secondFactorEnabled: boolean;
  readonly emailVerified: boolean;
}

const COPY_DONORS: readonly CopyDonor[] = [
  {
    donorId: administrator.id,
    name: 'Jana Nováková',
    variableSymbol: '1234567890',
    account: '19-2000145399/0800',
    amountMinor: 125050,
    administrator: true,
    secondFactorEnabled: true,
    emailVerified: true,
  },
  {
    donorId: '01a18e56-bdb0-775a-bd0a-a6075683e011',
    name: 'Petr Svoboda',
    variableSymbol: '9876543210',
    account: '2400123456/2010',
    amountMinor: 50000,
    administrator: false,
    secondFactorEnabled: false,
    emailVerified: false,
  },
];

const HELD_PAYMENT = {
  id: '019a1c00-0000-7000-8000-000000002001',
  bankTransactionId: 2001,
  bookedOn: '2026-10-12',
  amountMinor: 4200000,
  currency: 'CZK',
  variableSymbol: '0000000001',
  counterpartyAccount: '2900233333/2010',
  counterpartyName: 'Neznámý plátce',
  messageForRecipient: 'Dar',
  importedAt: '2026-10-17T10:00:00Z',
  unpairedByAdminAt: '2026-10-18T10:00:00Z',
  donation: null,
};

async function serveHeldPayment(page: Page): Promise<void> {
  await page.route(
    (url) =>
      url.pathname === '/api/admin/donations/payments' &&
      url.searchParams.get('pairing') !== 'paired',
    (route) =>
      route.fulfill({
        json: { year: null, availableYears: [2026], items: [HELD_PAYMENT], total: 1 },
      }),
  );
}

const WAITING_PAYMENT_ID = '019a1c00-0000-7000-8000-00000000f100';

function payment(id: string, donor: CopyDonor | null, amountMinor: number) {
  return {
    id,
    version: `0123456789ab${id.slice(-4)}`,
    bankTransactionId: Number.parseInt(id.slice(-4), 16),
    bookedOn: '2026-10-20',
    amountMinor,
    currency: 'CZK',
    variableSymbol: donor?.variableSymbol ?? '0000000001',
    counterpartyAccount: donor?.account ?? '000099-9999999999/0300',
    counterpartyName: donor?.name ?? 'Neznámý plátce',
    messageForRecipient: 'Dar',
    importedAt: '2026-10-20T10:00:00Z',
    unpairedByAdminAt: donor === null ? '2026-10-21T10:00:00Z' : null,
    accountVerification: false,
  };
}

async function serveCopy(page: Page): Promise<void> {
  const payments = COPY_DONORS.map((donor, index) =>
    payment(`019a1c00-0000-7000-8000-00000000f00${index}`, donor, donor.amountMinor),
  );
  await serveAdministrationCopy(page, {
    donations: {
      'payments:2026-10': [payment(WAITING_PAYMENT_ID, null, 4200000), ...payments],
      'donations:2026-10': COPY_DONORS.map((donor, index) => ({
        ...administrationCopyGift(
          payments[index].id,
          donor.donorId,
          '2026-10-20',
          donor.amountMinor,
        ),
        status: donor.emailVerified ? 'RECEIVED' : 'REFUNDED',
      })),
      'donor-records:2026-01': COPY_DONORS.map((donor) => ({
        donorId: donor.donorId,
        name: donor.name,
        type: 'PERSON',
        variableSymbol: donor.variableSymbol,
        companyIdentifier: null,
        address: { street: 'Dlouhá 1', city: 'Praha', postalCode: '110 00' },
        preferredLocale: 'cs',
        registeredAt: '2026-01-15T10:00:00Z',
        erasedAt: null,
      })),
    },
    donors: {
      'accounts:2026-01': COPY_DONORS.map((donor) => ({
        donorId: donor.donorId,
        name: donor.name,
        type: 'PERSON',
        variableSymbol: donor.variableSymbol,
        companyIdentifier: null,
        address: { street: 'Dlouhá 1', city: 'Praha', postalCode: '110 00' },
        preferredLocale: 'cs',
        registeredAt: '2026-01-15T10:00:00Z',
        erasedAt: null,
        email: `${donor.variableSymbol}@example.cz`,
        emailVerified: donor.emailVerified,
        administrator: donor.administrator,
        secondFactorEnabled: donor.secondFactorEnabled,
        passkeys: 0,
      })),
    },
  });
}

async function openAdministration(page: Page, path: string): Promise<void> {
  await page.setViewportSize(WIDE);
  await mockDonorApi(page, donorWithDonations);
  await rememberedSession(page);
  await mockAdministration(page);
  await serveHeldPayment(page);
  await serveCopy(page);
  const copied = whenAdministrationCopied(page);
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await copied();
}

async function amountsIn(scope: Locator, where: string, rowsOnly = true): Promise<Look[]> {
  await scope.evaluate(() => document.fonts.ready);
  const found = await scope.evaluate((element, inRows) => {
    const amount = /^\d{1,3}(?:[\s\u00a0]\d{3})*(?:,\d{2})?\u00a0Kč$/;
    const looks: { text: string; look: string }[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      const holder = node.parentElement;
      if (!amount.test(text) || holder === null || holder.getClientRects().length === 0) {
        continue;
      }
      if (inRows && holder.closest('tr') === null) {
        continue;
      }
      const style = getComputedStyle(holder);
      looks.push({
        text,
        look: [
          style.fontSize,
          style.fontWeight,
          style.color,
          style.fontFamily,
          style.fontVariantNumeric,
        ].join(' | '),
      });
    }
    return looks;
  }, rowsOnly);
  return found.map((entry) => ({ where, ...entry }));
}

async function amountsInRows(page: Page, where: string): Promise<Look[]> {
  return amountsIn(page.getByRole('main'), where);
}

async function pillsIn(page: Page, where: string): Promise<Look[]> {
  const main = page.getByRole('main');
  await main.evaluate(() => document.fonts.ready);
  const found = await main.evaluate((element) => {
    const pills: { text: string; look: string }[] = [];
    for (const candidate of Array.from(element.querySelectorAll('span, li'))) {
      const label = (candidate.textContent ?? '').trim();
      if (
        label === '' ||
        candidate.children.length > 0 ||
        candidate.closest('button, a, label') !== null
      ) {
        continue;
      }
      const box = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      const filled = style.backgroundColor !== 'rgba(0, 0, 0, 0)';
      const rounded = Number.parseFloat(style.borderTopLeftRadius) >= box.height / 2;
      if (box.width === 0 || !filled || !rounded || box.width < box.height * 1.5) {
        continue;
      }
      pills.push({
        text: label,
        look: [
          style.fontSize,
          style.fontWeight,
          style.lineHeight,
          style.paddingTop,
          style.paddingInlineStart,
          style.borderTopLeftRadius,
          `${Math.round(box.height)}px`,
        ].join(' | '),
      });
    }
    return pills;
  });
  return found.map((entry) => ({ where, ...entry }));
}

function distinctLooks(looks: readonly Look[]): Map<string, string[]> {
  const byLook = new Map<string, string[]>();
  for (const { where, text, look } of looks) {
    byLook.set(look, [...(byLook.get(look) ?? []), `${where}: ${text}`]);
  }
  return byLook;
}

test.describe('Given the administration with gifts on a computer', () => {
  test('when Platby, Přiřazené, Dárci, the donor card, the overview, Hromadná potvrzení and Moje dary list their amounts, then every amount in a row has one size, weight, colour and tabular figures', async ({
    page,
  }) => {
    const looks: Look[] = [];

    await openAdministration(page, '/sprava/platby');
    await expect(page.getByRole('main').getByText('jen ručně')).toBeVisible();
    looks.push(...(await amountsInRows(page, 'Platby')));
    await page.getByRole('button', { name: 'Přiřazené', exact: true }).click();
    await expect(page.getByRole('main').getByText('vráceno', { exact: true })).toBeVisible();
    looks.push(...(await amountsInRows(page, 'Přiřazené')));

    await page.goto('/sprava/darci');
    await expect(page.locator('main table tbody tr').first()).toBeVisible();
    looks.push(...(await amountsInRows(page, 'Dárci')));

    await page.goto(PETR_DETAIL_PATH);
    await expect(page.locator('main table tbody tr').first()).toBeVisible();
    looks.push(...(await amountsInRows(page, 'karta dárce')));

    await page.goto('/sprava');
    await expect(page.locator('main table tbody tr').first()).toBeVisible();
    looks.push(...(await amountsInRows(page, 'přehled')));
    const balance = page
      .getByRole('main')
      .locator('dt', { hasText: 'Zůstatek účtu' })
      .locator('+ dd');
    await expect(balance).toContainText('482\u00a0150,50\u00a0Kč');
    const balanceLooks = await amountsIn(balance, 'zůstatek', false);
    expect(balanceLooks).toHaveLength(1);
    looks.push(...balanceLooks);

    await page.goto('/darce/dary');
    await expect(page.locator('main table tbody tr').first()).toBeVisible();
    looks.push(...(await amountsInRows(page, 'Moje dary')));

    const where = new Set(looks.map((look) => look.where));
    expect([...where].sort()).toEqual(
      ['Dárci', 'Moje dary', 'Platby', 'Přiřazené', 'karta dárce', 'přehled', 'zůstatek'].sort(),
    );
    const byLook = distinctLooks(looks);
    expect(byLook.size, JSON.stringify(Object.fromEntries(byLook), null, 1)).toBe(1);
    expect(looks[0].look).toContain('tabular-nums');
  });

  test('when Hromadná potvrzení lists the donors of the year, then each total has the look of an amount in Platby', async ({
    page,
  }) => {
    await openAdministration(page, '/sprava/platby');
    await expect(page.getByRole('main').getByText('jen ručně')).toBeVisible();
    const [platby] = await amountsInRows(page, 'Platby');

    await mockYearlyReceipts(page, { donors: FOUR_DONORS });
    await page.goto('/sprava/hromadna-potvrzeni');
    await expect(page.locator('.donors-table tbody tr').first()).toBeVisible();
    const totals = await amountsInRows(page, 'Hromadná potvrzení');

    expect(totals.length).toBeGreaterThan(0);
    expect(totals.map(({ look }) => look)).toEqual(totals.map(() => platby.look));
  });
});

test.describe('Given the administration with status tags on a computer', () => {
  test('when Platby, Přiřazené, Dárci, the donor card, Starší symboly, Správci and Aktuality show their tags, then every tag has one size, weight and height', async ({
    page,
  }) => {
    const looks: Look[] = [];
    const counts = new Map<string, number>();
    const collect = async (where: string) => {
      const pills = await pillsIn(page, where);
      counts.set(where, pills.length);
      looks.push(...pills);
    };

    await openAdministration(page, '/sprava/platby');
    await expect(page.getByRole('main').getByText('jen ručně')).toBeVisible();
    await collect('Platby');
    await page.getByRole('button', { name: 'Přiřazené', exact: true }).click();
    await expect(page.getByRole('main').getByText('vráceno', { exact: true })).toBeVisible();
    await collect('Přiřazené');

    for (const [where, path] of [
      ['Dárci', '/sprava/darci'],
      ['karta dárce', PETR_DETAIL_PATH],
      ['Starší symboly', '/sprava/starsi-symboly'],
      ['Správci', '/sprava/spravci'],
      ['Aktuality', '/sprava/aktuality'],
    ] as const) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main .ui-card').first()).toBeVisible();
      await expect.poll(async () => (await pillsIn(page, where)).length).toBeGreaterThan(0);
      await collect(where);
    }

    expect(counts.get('Platby')).toBeGreaterThan(0);
    const byLook = distinctLooks(looks);
    expect(byLook.size, JSON.stringify(Object.fromEntries(byLook), null, 1)).toBe(1);
  });
});

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

async function fillContrastsOfBadges(
  scope: Locator,
): Promise<{ text: string; contrast: number }[]> {
  return scope.evaluate((main) => {
    const probe = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    })!;
    const rgbaOf = (color: string): Rgba => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const over = (top: Rgba, under: Rgba): Rgba => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const groundOf = (element: Element | null): Rgba => {
      const layers: Rgba[] = [];
      for (let at = element; at; at = at.parentElement) {
        const layer = rgbaOf(getComputedStyle(at).backgroundColor);
        if (layer.a > 0) {
          layers.push(layer);
        }
        if (layer.a === 1) {
          break;
        }
      }
      return layers.reduceRight((under, top) => over(top, under), {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      });
    };
    const luminance = ({ r, g, b }: Rgba) => {
      const channel = (value: number) => {
        const unit = value / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    return Array.from(main.querySelectorAll('.ui-badge--neutral, .ui-badge--warning'))
      .filter((badge) => badge.getClientRects().length > 0)
      .map((badge) => {
        const ground = groundOf(badge.parentElement);
        const pill = over(rgbaOf(getComputedStyle(badge).backgroundColor), ground);
        const [light, dark] = [luminance(pill), luminance(ground)].sort((a, b) => b - a);
        return {
          text: (badge.textContent ?? '').trim(),
          contrast: Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100,
        };
      });
  });
}

const ACCOUNTS_WITH_EVERY_STATE = [
  bankAccountItem({ shared: true }),
  bankAccountItem({
    id: '0192f0c4-0000-7000-8000-000000000002',
    accountNumber: '1234567890/0800',
    status: 'AWAITING_PAYMENT',
    pairingExcluded: true,
    verifiedOn: null,
  }),
  bankAccountItem({
    id: '0192f0c4-0000-7000-8000-000000000003',
    accountNumber: '2400123456/2010',
    status: 'DISCONNECTED',
    disconnectedOn: '2026-10-01',
  }),
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Given a signed-in donor in the ${colorScheme} appearance on a computer`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('when Bankovní účty lists a shared, an excluded and a disconnected account, then each neutral and warning badge stands out from its card', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) => route.fulfill({ json: { items: ACCOUNTS_WITH_EVERY_STATE } }),
      );
      await page.setViewportSize(WIDE);
      await signIn(page);
      await openDonorSection(page, 'Bankovní účty');
      await expect(page.locator('main .account-status')).toHaveCount(3);

      const contrasts = await fillContrastsOfBadges(page.getByRole('main'));

      expect(contrasts.map(({ text }) => text).sort()).toEqual(
        ['Jen s\u00a0variabilním symbolem', 'Nepřiřazujeme', 'Sdílený'].sort(),
      );
      for (const { text, contrast } of contrasts) {
        expect(contrast, text).toBeGreaterThanOrEqual(NOTICEABLE_FILL_CONTRAST);
      }
    });

    test('when Moje dary lists a refunded gift and an account verification, then each neutral badge stands out from its card', async ({
      page,
    }) => {
      await mockDonorApi(page, {
        ...donorWithDonations,
        list: {
          ...donorWithDonations.list,
          items: [
            ...donorWithDonations.list.items,
            donationItem({
              id: '0192f0f1-0000-7000-8000-000000000009',
              receivedAt: '2026-09-01',
              amountMinor: 100,
              accountVerification: true,
              receiptAvailable: false,
            }),
          ],
        },
      });
      await page.setViewportSize(WIDE);
      await signIn(page);
      await openDonorSection(page, 'Moje dary');
      await expect(page.locator('main table tbody tr').first()).toBeVisible();

      const contrasts = await fillContrastsOfBadges(page.getByRole('main'));

      expect(contrasts.length).toBeGreaterThanOrEqual(2);
      for (const { text, contrast } of contrasts) {
        expect(contrast, text).toBeGreaterThanOrEqual(NOTICEABLE_FILL_CONTRAST);
      }
    });
  });

  test.describe(`Given an administrator on a phone in the ${colorScheme} appearance`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('when they open a paired payment with an issued receipt, then the badge potvrzení vystaveno stands out from the grey box of Přiřazená platba', async ({
      page,
    }) => {
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await page.setViewportSize(PHONE);
      await rememberedSession(page);
      const copied = whenAdministrationCopied(page);
      await page.goto('/sprava/platby?stav=prirazene');
      await copied();
      await page.locator('button.payment-row').first().click();
      const sheet = page.getByRole('dialog', { name: 'Přiřazená platba' });
      await expect(sheet.getByText('potvrzení vystaveno', { exact: true })).toBeVisible();

      const contrasts = await fillContrastsOfBadges(sheet.locator('.pair-payment'));

      expect(contrasts.map(({ text }) => text)).toEqual(['potvrzení vystaveno']);
      for (const { text, contrast } of contrasts) {
        expect(contrast, text).toBeGreaterThanOrEqual(NOTICEABLE_FILL_CONTRAST);
      }
    });
  });
}

test.describe('Given a signed-in donor reading values on a computer', () => {
  test('when Přidat bankovní účet shows the payment, then the message has the text face of its label and not the face of values read character by character', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.setViewportSize(WIDE);
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');
    await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();
    const dialog = page.getByRole('dialog');
    const row = dialog.locator('.add-account-row', { hasText: 'Zpráva pro příjemce' });
    const message = row.locator('.bank-value');
    await expect(message).toContainText('Ověření účtu');

    const { messageFace, labelFace, monospaceFace } = await row.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.fontFamily = 'var(--font-mono)';
      element.append(probe);
      const faces = {
        messageFace: getComputedStyle(element.querySelector('.bank-value')!).fontFamily,
        labelFace: getComputedStyle(element.querySelector('dt')!).fontFamily,
        monospaceFace: getComputedStyle(probe).fontFamily,
      };
      probe.remove();
      return faces;
    });

    expect(messageFace).toBe(labelFace);
    expect(messageFace).not.toBe(monospaceFace);
  });

  test('when Údaje a zabezpečení lists a connected application, then its name has the face of the text around it', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donors/me/connections',
      (route) => route.fulfill({ json: { items: [claudeConnection] } }),
    );
    await page.setViewportSize(WIDE);
    await signIn(page, administrator);
    await openDonorSection(page, 'Údaje a zabezpečení');
    const name = page.locator('.connections .connection-client');
    await expect(name).toHaveText('claude.ai');

    const [nameFace, textFace] = await Promise.all([
      name.evaluate((element) => getComputedStyle(element).fontFamily),
      page
        .locator('.connections .connection-dates')
        .evaluate((element) => getComputedStyle(element).fontFamily),
    ]);

    expect(nameFace).toBe(textFace);
  });
});
