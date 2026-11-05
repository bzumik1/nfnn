import type { Page } from '@playwright/test';
import { rowsSha256 } from '../src/app/features/donations/sync/canonical-rows';
import {
  donor,
  type DonorSyncMock,
  mockDonorApi,
  noDonations,
  openDonorSection,
  session,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';

const CANARY_PAYER = 'Zlatohlávek Kanárkový';
const CANARY_IBAN = 'CZ4955000000001041000071';
const PASSWORD = 'correct horse battery';
const DEVICE_DATABASE = 'nfnn.device';

async function canarySync(): Promise<DonorSyncMock> {
  const rows = [{ payerName: CANARY_PAYER, counterpartyIban: CANARY_IBAN, amountMinor: 50_000 }];
  return {
    summary: { totalAmountMinor: 50_000, count: 1 },
    chunks: [{ id: 'donations:2026', rowsSha256: await rowsSha256(rows), count: 1, rows }],
  };
}

interface RawDevice {
  readonly databases: readonly string[];
  readonly text: string;
  readonly wraps: readonly string[];
  readonly marker: string | null;
}

function rawDevice(page: Page): Promise<RawDevice> {
  return page.evaluate(async (name) => {
    const listed = (await indexedDB.databases()).map((database) => database.name ?? '');
    if (!listed.includes(name)) {
      return {
        databases: listed,
        text: '',
        wraps: [],
        marker: localStorage.getItem('nfnn.device-copy'),
      };
    }
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const values: unknown[] = [];
    for (const store of Array.from(database.objectStoreNames)) {
      values.push(
        store,
        await new Promise((resolve, reject) => {
          const request = database.transaction(store).objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }),
      );
    }
    database.close();
    const copies = (values[values.indexOf('copies') + 1] ?? []) as {
      wraps: { kind: string }[];
    }[];
    return {
      databases: listed,
      text: JSON.stringify(values, (_key, value: unknown) =>
        value instanceof CryptoKey ? '<CryptoKey>' : value,
      ),
      wraps: copies.flatMap((copy) => copy.wraps.map((wrap) => wrap.kind)).sort(),
      marker: localStorage.getItem('nfnn.device-copy'),
    };
  }, DEVICE_DATABASE);
}

function leaked(raw: RawDevice, canary: string): boolean {
  const forms = [0, 1, 2].flatMap((pad) => {
    const base64 = Buffer.concat([Buffer.alloc(pad), Buffer.from(canary)]).toString('base64');
    const stable = base64.slice([0, 2, 3][pad], -3);
    return [stable, stable.replace(/\+/g, '-').replace(/\//g, '_')];
  });
  return [canary, ...forms].some((form) => raw.text.includes(form));
}

async function openDeviceData(page: Page): Promise<void> {
  await openDonorSection(page, 'Údaje a zabezpečení');
  await expect(page.getByRole('heading', { name: 'Data v tomto zařízení' })).toBeVisible();
}

test.describe('Given a donor who signs in with a password on a device that keeps an encrypted copy', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, { ...noDonations, sync: await canarySync() });
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await page.route('**/api/donors/auth/logout', (route) => route.fulfill({ status: 204 }));
  });

  test('when the copy is downloaded, then the Argon2id worker wraps it with her password under the production policy and the raw database holds neither her gifts nor her e-mail or password', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);

    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();
    await expect.poll(async () => (await rawDevice(page)).wraps).toEqual(['password', 'session']);
    const raw = await rawDevice(page);
    expect(raw.databases).toContain(DEVICE_DATABASE);
    for (const canary of [CANARY_PAYER, CANARY_IBAN, donor.email, PASSWORD, 'donations:2026']) {
      expect(leaked(raw, canary), canary).toBe(false);
    }
  });

  test('when she loads the page again, then the copy opens without her password and is still stored', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();

    await page.reload();

    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();
  });

  test('when she asks to load the data again, then a status line says they are loaded', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();

    await page.getByRole('button', { name: 'Načíst data znovu' }).click();

    await expect(
      page.getByRole('status').filter({ hasText: 'Data jsou načtená znovu.' }),
    ).toBeVisible();
  });

  test('when she signs out, then the copy stays on the device with only its password wrap', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();

    await page.locator('.topbar-logout').click();
    await expect(page).toHaveURL(/\/$/);

    await expect.poll(async () => (await rawDevice(page)).wraps).toEqual(['password']);
  });

  test('when she deletes the data on this device, then she is signed out, sent home and the database is gone', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();

    await page.getByRole('button', { name: 'Smazat data z tohoto zařízení' }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Smazat data z tohoto zařízení?' }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Zrušit' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Smazat a odhlásit' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('status').getByText('Odhlásili jste se.')).toBeVisible();
    await expect.poll(async () => (await rawDevice(page)).databases).not.toContain(DEVICE_DATABASE);
    expect((await rawDevice(page)).marker).toBeNull();
  });
});
