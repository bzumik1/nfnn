import { Page } from '@playwright/test';
import { rowsSha256 } from '../src/app/features/donations/sync/canonical-rows';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, signIn } from './donor-session';

const PAYMENTS = '/api/admin/donations/payments';

const payment = {
  id: '019a1c00-0000-7000-8000-000000001001',
  version: '3f2a9c4e1b7d6085',
  bankTransactionId: 1001,
  bookedOn: '2026-10-10',
  amountMinor: 50000,
  currency: 'CZK',
  variableSymbol: '1111111111',
  counterpartyAccount: '2900233333/2010',
  counterpartyName: 'Nováková Jana',
  messageForRecipient: 'Dar pro fond',
  importedAt: '2026-10-17T10:00:00Z',
  unpairedByAdminAt: null,
  accountVerification: false,
};

const record = {
  donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
  name: 'Jana Nováková',
  type: 'PERSON',
  variableSymbol: '4821937560',
  companyIdentifier: null,
  address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
  preferredLocale: 'cs',
  registeredAt: '2026-01-15T10:00:00Z',
  erasedAt: null,
};

const account = {
  donorId: record.donorId,
  type: 'PERSON',
  name: record.name,
  companyIdentifier: null,
  address: record.address,
  email: 'jana@example.cz',
  variableSymbol: record.variableSymbol,
  preferredLocale: 'cs',
  registeredAt: record.registeredAt,
  emailVerified: true,
  administrator: false,
  secondFactorEnabled: false,
  passkeys: 0,
  erasedAt: null,
};

interface Chunk {
  readonly id: string;
  readonly rowsSha256: string;
  readonly count: number;
  readonly rows: readonly unknown[];
}

async function chunk(id: string, rows: readonly unknown[]): Promise<Chunk> {
  return { id, rowsSha256: await rowsSha256(rows), count: rows.length, rows };
}

async function serveCopy(page: Page, part: 'donations' | 'donors', chunks: Chunk[]) {
  const summary =
    part === 'donations'
      ? { summary: { today: '2026-10-18', receiptsAvailableFrom: 2026, byYear: [] } }
      : {};
  const head = { subject: administrator.id, administrator: true, ...summary };
  await page.route(
    (url) => url.pathname === `/api/admin/${part}/sync`,
    (route) =>
      route.fulfill({
        json: {
          ...head,
          chunks: chunks.map(({ id, rowsSha256, count }) => ({ id, rowsSha256, count })),
        },
      }),
  );
  await page.route(
    (url) => url.pathname === `/api/admin/${part}/sync/chunks`,
    (route) => {
      const asked = (new URL(route.request().url()).searchParams.get('ids') ?? '').split(',');
      route.fulfill({
        json: {
          ...head,
          chunks: chunks.filter((held) => asked.includes(held.id)),
          missing: asked.filter((id) => !chunks.some((held) => held.id === id)),
        },
      });
    },
  );
}

test.describe('Given an administrator whose device keeps the administration copy', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveCopy(page, 'donations', [
      await chunk('payments:2026-10', [payment]),
      await chunk('donor-records:2026-01', [record]),
    ]);
    await serveCopy(page, 'donors', [await chunk('accounts:2026-01', [account])]);
  });

  test('when the payments open and the device goes offline, then they come from the copy, say how old it is and pairing waits for a connection', async ({
    page,
    context,
  }) => {
    const stored = Promise.all(
      ['donations', 'donors'].map((part) =>
        page.waitForResponse(
          (response) => new URL(response.url()).pathname === `/api/admin/${part}/sync/chunks`,
        ),
      ),
    );
    await signIn(page, administrator);
    await stored;
    await page.getByRole('link', { name: 'Správa' }).click();
    const paymentsLink = page.getByRole('link', { name: 'Platby z banky' });
    await expect(paymentsLink).toBeVisible();
    const serverReads: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === PAYMENTS) {
        serverReads.push(request.url());
      }
    });
    await paymentsLink.click();

    await expect(page.getByRole('row').filter({ hasText: 'Nováková Jana' })).toBeVisible();
    expect(serverReads).toEqual([]);

    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.abort('internetdisconnected'),
    );
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: /^Offline · údaje z \d{1,2}:\d{2}$/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Přiřadit dárci' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.pair-result')).toHaveText(
      /Jana Nováková\s*VS 4821937560 · jana@example.cz/,
    );
    await dialog.getByRole('radio', { name: /Jana Nováková/ }).check();
    await expect(
      dialog.getByRole('button', { name: 'Přiřadit dárci Jana Nováková' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(serverReads).toEqual([]);
    await context.setOffline(false);
  });
});
