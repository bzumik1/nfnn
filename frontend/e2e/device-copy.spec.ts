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
import { DEVICE_DATABASE, leaked, rawDevice } from './raw-device';

const CANARY_PAYER = 'Zlatohlávek Kanárkový';
const CANARY_IBAN = 'CZ4955000000001041000071';
const PASSWORD = 'correct horse battery';

async function canarySync(): Promise<DonorSyncMock> {
  const rows = [{ payerName: CANARY_PAYER, counterpartyIban: CANARY_IBAN, amountMinor: 50_000 }];
  return {
    summary: { totalAmountMinor: 50_000, count: 1 },
    chunks: [{ id: 'donations:2026', rowsSha256: await rowsSha256(rows), count: 1, rows }],
  };
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
    const cookies = JSON.stringify(await page.context().cookies());
    for (const canary of [CANARY_PAYER, CANARY_IBAN, donor.email, PASSWORD, 'donations:2026']) {
      expect(leaked(`${raw.text}\n${cookies}`, canary), canary).toBe(false);
    }
  });

  test('when she loads the page again, then the same copy opens with its session key, without her password and without downloading again', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();
    const before = await rawDevice(page);
    const syncs: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/donations/me/sync')) {
        syncs.push(request.url());
      }
    });

    await page.reload();

    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();
    expect((await rawDevice(page)).copyIds).toEqual(before.copyIds);
    expect(before.copyIds).toHaveLength(1);
    expect(syncs).toEqual([]);
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

    await page.getByRole('banner').getByRole('button', { name: 'Účet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Odhlásit se' }).click();
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
    await dialog.getByRole('button', { name: 'Smazat data a odhlásit' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page
        .getByRole('status')
        .getByText('Data z tohoto zařízení jsme smazali a odhlásili jsme vás.'),
    ).toBeVisible();
    await expect.poll(async () => (await rawDevice(page)).databases).not.toContain(DEVICE_DATABASE);
    expect((await rawDevice(page)).marker).toBeNull();
  });
});
