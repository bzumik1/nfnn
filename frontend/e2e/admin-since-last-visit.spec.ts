import AxeBuilder from '@axe-core/playwright';
import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  administrationCopyGift,
  administrator,
  mockDonorApi,
  serveAdministrationCopy,
  session,
} from './donor-session';

const PAVEL = '01a18e56-bdb0-775a-bd0a-a6075683a002';
const PETR = '01a18e56-bdb0-775a-bd0a-a6075683d002';

const LAST_VISIT = String.raw`^Minulá návštěva na tomto zařízení byla \d{1,2}\. \d{1,2}\. \d{4} \d{1,2}:\d{2}\.`;

function payment(id: string, bookedOn: string, amountMinor: number) {
  return {
    id,
    version: `0123456789ab${id.slice(-4)}`,
    bankTransactionId: Number(id.slice(-4)),
    bookedOn,
    amountMinor,
    currency: 'CZK',
    variableSymbol: null,
    counterpartyAccount: '2900233333/2010',
    counterpartyName: 'Nováková Jana',
    messageForRecipient: null,
    importedAt: `${bookedOn}T10:00:00Z`,
    unpairedByAdminAt: null,
    accountVerification: false,
  };
}

function record(donorId: string, name: string, registeredAt: string) {
  return {
    donorId,
    name,
    type: 'PERSON',
    variableSymbol: `48219375${donorId.slice(-2)}`,
    companyIdentifier: null,
    address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
    preferredLocale: 'cs',
    registeredAt,
    erasedAt: null,
  };
}

function account(donorId: string, name: string) {
  return {
    donorId,
    type: 'PERSON',
    name,
    companyIdentifier: null,
    address: null,
    email: `${donorId.slice(-4)}@example.cz`,
    variableSymbol: null,
    preferredLocale: 'cs',
    registeredAt: '2026-01-15T10:00:00Z',
    emailVerified: true,
    administrator: true,
    secondFactorEnabled: true,
    passkeys: 0,
    erasedAt: null,
  };
}

function receipt(id: string, donorId: string) {
  return {
    id,
    donorId,
    status: 'ACTIVE',
    kind: 'DONATION',
    number: `2026-${id.slice(-4)}`,
    donationId: null,
    year: null,
    issuedOn: '2026-11-11',
    issuedAt: '2026-11-11T09:00:00Z',
    withdrawnAt: null,
    withdrawalReason: null,
    locale: 'cs',
    keyId: 'key-1',
  };
}

function action(id: string, adminId: string) {
  return {
    id,
    adminId,
    action: 'PAIR_PAYMENT',
    subjectId: null,
    performedAt: '2026-11-11T12:00:00Z',
    client: null,
  };
}

const HELD_PAYMENT = payment('019a1c00-0000-7000-8000-000000001001', '2026-11-02', 10000);
const JANA = record(administrator.id, 'Jana Nováková', '2026-01-15T10:00:00Z');

const ON_LAST_VISIT = {
  donations: {
    'payments:2026-11': [HELD_PAYMENT],
    'donor-records:2026-01': [JANA],
  },
  donors: {
    'accounts:2026-01': [
      account(administrator.id, 'Jana Nováková'),
      account(PAVEL, 'Pavel Znamenáček'),
    ],
  },
};

const PAIRED = payment('019a1c00-0000-7000-8000-000000001003', '2026-11-10', 100000);
const WAITING = payment('019a1c00-0000-7000-8000-000000001002', '2026-11-09', 50000);

const SINCE_THEN = {
  donations: {
    'payments:2026-11': [PAIRED, WAITING, HELD_PAYMENT],
    'donations:2026-11': [
      { ...administrationCopyGift(PAIRED.id, administrator.id, '2026-11-10', 100000) },
    ],
    'donor-records:2026-01': [JANA],
    'donor-records:2026-11': [record(PETR, 'Petr Dvořák', '2026-11-10T08:00:00Z')],
    'receipts:2026': [receipt('019a1c00-0000-7000-8000-00000000r001', administrator.id)],
  },
  donors: {
    ...ON_LAST_VISIT.donors,
    'audit:2026-11': [
      action('019a1c00-0000-7000-8000-00000000a002', PAVEL),
      action('019a1c00-0000-7000-8000-00000000a001', administrator.id),
    ],
  },
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

function block(page: Page) {
  return page.getByRole('region', { name: 'Od minulé návštěvy' });
}

test.describe('Given an administrator whose device keeps the administration', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveAdministrationCopy(page, ON_LAST_VISIT);
    await rememberedSession(page);
  });

  test('when they open the administration on this device for the first time and come back after payments, a donor, a receipt and another administrator came in, then the block first says what it will show and then names each and leads to the waiting payments', async ({
    page,
  }) => {
    await page.goto('/sprava');
    await expect(block(page)).toContainText(
      'Na tomto zařízení zatím není s čím porovnat. Příště tu uvidíte, co mezitím přibylo: platby, dárci, potvrzení a úkony dalších správců.',
    );
    await serveAdministrationCopy(page, SINCE_THEN);

    await page.reload();

    await expect(block(page).locator('.since-lead')).toHaveText(
      new RegExp(`${LAST_VISIT} Od té doby přišly 2 platby za 1\\s500\\sKč\\.$`),
    );
    await expect(block(page).getByRole('link', { name: '1 platba za 1 000 Kč' })).toHaveAttribute(
      'href',
      '/sprava/platby?stav=prirazene&od=2026-11-10',
    );
    await expect(block(page).getByRole('link', { name: '1 nová registrace' })).toHaveAttribute(
      'href',
      '/sprava/darci',
    );
    await expect(block(page)).toContainText('Vydaná potvrzení 1 potvrzení');
    await expect(
      block(page).getByRole('link', { name: 'Pavel Znamenáček: 1 úkon' }),
    ).toHaveAttribute('href', '/sprava/historie');
    const axe = await new AxeBuilder({ page })
      .include('[aria-labelledby="admin-visit-title"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);

    await block(page).getByRole('link', { name: '1 platba za 500 Kč' }).click();

    await expect(page).toHaveURL(/\/sprava\/platby\?od=2026-11-09$/);
    await expect(page.getByLabel('Od', { exact: true })).toHaveValue('2026-11-09');
  });

  test('when they close the summary and come back with nothing new since, then the block says so in one sentence', async ({
    page,
  }) => {
    await page.goto('/sprava');
    await expect(block(page)).toContainText('zatím není s čím porovnat');
    await serveAdministrationCopy(page, SINCE_THEN);
    await page.reload();
    await expect(block(page)).toContainText('Od té doby přišly 2 platby');
    await block(page).getByRole('button', { name: 'Zavřít souhrn' }).click();
    await expect(block(page)).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeFocused();

    await page.reload();

    await expect(block(page).locator('.since-lead')).toHaveText(
      new RegExp(`${LAST_VISIT} Od té doby nepřibylo nic nového\\.$`),
    );
    await expect(block(page).locator('dl')).toHaveCount(0);
  });
});
