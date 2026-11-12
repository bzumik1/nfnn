import { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import {
  ADMINISTRATION_LOCKED,
  ADMINISTRATION_UNLOCK_PATH,
  expect,
  test,
  unlockAdministration,
} from './fixtures';
import { administrator, mockDonorApi, session } from './donor-session';
import { waitWhileNothingMayHappen } from './fixed-waits';
import { deviceRecord, fakePushDevice, PushDeviceOptions } from './push-device';

const PUSH = '/api/admin/operations/push';
const PUBLIC_KEY = `B${'E'.repeat(86)}`;
const OWNER_KEY = 'nfnn.alerts.device-owner';
const NOTHING_SHOWS_MS = 1500;
const PAGE_TITLE = 'Občas a pro technika';

test.use({ unlocksAdministration: false });

interface Sent {
  readonly method: string;
  readonly path: string;
}

async function enterAdministration(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED })).toBeVisible();
  await unlockAdministration(page);
  await expect(page.getByRole('heading', { level: 1, name: PAGE_TITLE })).toBeVisible();
}

function ownerMarkOf(donorId: string): string {
  return createHash('sha256').update(`nfnn.alerts.device-owner:${donorId}`).digest('hex');
}

async function openAdministration(
  page: Page,
  options: { installed: boolean; device: PushDeviceOptions; ownerMark?: string },
): Promise<Sent[]> {
  const sent: Sent[] = [];
  if (options.installed) {
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }),
    );
  }
  await fakePushDevice(page, options.device);
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === ADMINISTRATION_UNLOCK_PATH,
    (route) => route.fulfill({ status: 204 }),
  );
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.route(
    (url) => url.pathname.startsWith(PUSH),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      sent.push({ method: route.request().method(), path });
      if (path === `${PUSH}/subscriptions`) {
        return route.fulfill({
          status: 201,
          json: {
            id: 'push-this-phone',
            service: 'apple',
            alerts: { bankImport: true, backups: true, mail: true },
            createdAt: '2026-11-10T09:00:00Z',
            lastDeliveredAt: null,
            failuresInARow: 0,
            current: true,
          },
        });
      }
      if (path === `${PUSH}/test`) {
        return route.fulfill({ json: { delivered: 1, failed: 0, removed: 0 } });
      }
      return route.fulfill({
        json: { publicKey: PUBLIC_KEY, deviceSession: true, subscriptions: [], openAlerts: [] },
      });
    },
  );
  await page.goto('/');
  await page.evaluate(
    ({ installed, ownerMark, ownerKey }) => {
      localStorage.setItem(installed ? 'nfnn.donor-session-app' : 'nfnn.donor-session', '1');
      if (ownerMark) {
        localStorage.setItem(ownerKey, ownerMark);
      }
    },
    { installed: options.installed, ownerMark: options.ownerMark, ownerKey: OWNER_KEY },
  );
  await page.goto('/sprava/vice');
  await enterAdministration(page);
  return sent;
}

test.describe('Given an administrator in the installed app on a phone without alerts', () => {
  test('when the administration opens and they turn the alerts on, then the device asks once, every kind goes on and a test alert comes', async ({
    page,
  }) => {
    const sent = await openAdministration(page, {
      installed: true,
      device: { permission: 'default', permissionAnswer: 'granted' },
    });

    const offer = page.getByRole('dialog', { name: 'Zapnout upozornění?' });
    await expect(offer).toContainText('Upozornění neříká jména ani částky.');
    expect((await deviceRecord(page)).permissionRequests).toBe(0);

    await offer.getByRole('button', { name: 'Zapnout' }).click();

    const done = page.getByRole('dialog', { name: 'Upozornění jsou zapnutá' });
    await expect(done).toContainText('Poslali jsme zkušební upozornění');
    expect((await deviceRecord(page)).permissionRequests).toBe(1);
    expect((await deviceRecord(page)).subscribedWith).toEqual([PUBLIC_KEY]);
    expect(sent.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
      `${PUSH}/subscriptions`,
      `${PUSH}/test`,
    ]);
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), OWNER_KEY))
      .toBe(ownerMarkOf(administrator.id));

    await done.getByRole('button', { name: 'Hotovo' }).click();
    await expect(done).toBeHidden();
  });

  test('when they put the offer off, then nothing is asked and the next start offers nothing', async ({
    page,
  }) => {
    await openAdministration(page, {
      installed: true,
      device: { permission: 'default', permissionAnswer: 'granted' },
    });

    await page
      .getByRole('dialog', { name: 'Zapnout upozornění?' })
      .getByRole('button', { name: 'Teď ne' })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.reload();
    await enterAdministration(page);
    await waitWhileNothingMayHappen(page, NOTHING_SHOWS_MS);

    await expect(page.getByRole('dialog')).toBeHidden();
    expect((await deviceRecord(page)).permissionRequests).toBe(0);
  });

  test('when the phone allows notifications and they turned the alerts on here last, then the alerts come back on without a question or a test alert', async ({
    page,
  }) => {
    const sent = await openAdministration(page, {
      installed: true,
      device: { permission: 'granted' },
      ownerMark: ownerMarkOf(administrator.id),
    });

    await expect
      .poll(() => sent.filter((call) => call.method === 'POST').map((call) => call.path))
      .toEqual([`${PUSH}/subscriptions`]);
    await waitWhileNothingMayHappen(page, NOTHING_SHOWS_MS);
    await expect(page.getByRole('dialog')).toBeHidden();
    expect((await deviceRecord(page)).permissionRequests).toBe(0);
    expect(sent.some((call) => call.path === `${PUSH}/test`)).toBe(false);
  });
});

test('Given an administrator in a browser tab, when the administration opens, then no offer appears and nothing is asked or sent', async ({
  page,
}) => {
  const sent = await openAdministration(page, {
    installed: false,
    device: { permission: 'default', permissionAnswer: 'granted' },
  });
  await waitWhileNothingMayHappen(page, NOTHING_SHOWS_MS);

  await expect(page.getByRole('dialog')).toBeHidden();
  expect(sent.filter((call) => call.method !== 'GET')).toEqual([]);
  expect((await deviceRecord(page)).permissionRequests).toBe(0);
});
