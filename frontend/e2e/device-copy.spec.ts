import type { Page } from '@playwright/test';
import { rowsSha256 } from '../src/app/features/donations/sync/canonical-rows';
import { donations as twoGifts, ISSUING } from './receipt-donations';
import { issuedReceipt } from './receipt-issuing';
import {
  donationItem,
  donor,
  donorSyncOf,
  type DonorSyncMock,
  mockDonorApi,
  mockDonorSync,
  noDonations,
  openDonorSection,
  opensSectionsInSheet,
  showAccountList,
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

  test('when she loads the page again, then the same copy opens with its session key, without her password, and only its manifest is asked for to catch it up', async ({
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
    if (opensSectionsInSheet(page)) {
      await openDeviceData(page);
    }

    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();
    expect((await rawDevice(page)).copyIds).toEqual(before.copyIds);
    expect(before.copyIds).toHaveLength(1);
    await expect.poll(() => syncs.length).toBeGreaterThan(0);
    expect(new Set(syncs.map((url) => new URL(url).pathname))).toEqual(
      new Set(['/api/donations/me/sync']),
    );
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

    await (await showAccountList(page)).getByRole('button', { name: 'Odhlásit se' }).click();
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
    await expect(
      dialog.getByRole('heading', { name: 'Smazat data z tohoto zařízení?' }),
    ).toBeFocused();
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

test.describe('Given a donor whose copy on this device holds her gifts and her yearly receipt', () => {
  const yearly = issuedReceipt({ year: 2025 }, { ...ISSUING, withArt: true });
  const newGift = donationItem({
    id: '0192f0f1-0000-7000-8000-000000000003',
    receivedAt: '2026-04-02',
    amountMinor: 30000,
  });

  const gifts = (page: Page) =>
    page.locator('.payments-card tbody tr, .payments-card .donation-rows > li');

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, {
      ...twoGifts,
      receipts: { ...ISSUING, withArt: true },
      sync: await donorSyncOf(twoGifts.summary, {
        gifts: twoGifts.list.items,
        receipts: [yearly],
      }),
    });
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();
  });

  test('when she opens Moje dary again while the server answers nothing about her gifts, then they show from the copy, and a new gift comes in when the copy catches up, behind Zobrazit 1 nový dar', async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === '/api/donations/me' || url.pathname === '/api/donations/me/summary',
      (route) => route.fulfill({ status: 503, body: '' }),
    );
    await mockDonorSync(
      page,
      await donorSyncOf(
        {
          ...twoGifts.summary,
          count: 3,
          totalAmountMinor: 105000,
          lastReceivedAt: '2026-04-02',
          byYear: [{ year: 2026, count: 2, totalAmountMinor: 80000 }, twoGifts.summary.byYear[1]],
        },
        { gifts: [newGift, ...twoGifts.list.items], receipts: [yearly] },
      ),
    );
    await page.route(
      (url) => url.pathname === '/api/donations/me/sync',
      async (route) => {
        await held;
        await route.fallback();
      },
    );

    await page.goto('/darce/dary');

    await expect(gifts(page)).toHaveCount(2);
    release();
    const pill = page.locator('.bank-check-incoming').filter({ hasText: 'Zobrazit 1 nový dar' });
    await expect(pill).toBeVisible();
    await expect(gifts(page)).toHaveCount(2);
    await pill.click();
    await expect(gifts(page)).toHaveCount(3);
    await expect(gifts(page).first()).toContainText('300 Kč');
  });

  test('when the server cannot be reached for her yearly receipt, then it is drawn again from the copy with the signature kept in it', async ({
    page,
  }) => {
    await openDonorSection(page, 'Potvrzení o daru');
    await page.route(
      (url) =>
        url.pathname === '/api/donations/me/receipts' ||
        url.pathname.startsWith('/api/donations/me/receipt-images/'),
      (route) => route.abort('internetdisconnected'),
    );

    const download = page.waitForEvent('download');
    await page.locator('.yearly-pdf').first().click();

    expect((await download).suggestedFilename()).toBe('potvrzeni-o-darech-2025.pdf');
  });
});
