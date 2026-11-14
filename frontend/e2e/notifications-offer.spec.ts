import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, rememberedDonorSession } from './donor-session';
import { waitWhileNothingMayHappen } from './fixed-waits';
import { comeBack, leaveTheApp } from './page-visibility';
import { deviceRecord, fakePushDevice } from './push-device';

const PUSH = '/api/operations/push';
const PUBLIC_KEY = `B${'E'.repeat(86)}`;
const OFFER_TITLE = 'Chcete vědět, až dar dorazí?';
const NOTHING_SHOWS_MS = 1500;

interface Sent {
  readonly method: string;
  readonly path: string;
}

async function openOverview(page: Page, { installed }: { installed: boolean }): Promise<Sent[]> {
  const sent: Sent[] = [];
  if (installed) {
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }),
    );
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
  });
  await fakePushDevice(page, { permission: 'default', permissionAnswer: 'granted' });
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname.startsWith(`${PUSH}/`),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      sent.push({ method: route.request().method(), path });
      if (path === `${PUSH}/device`) {
        return route.fulfill({
          json: {
            service: 'apple',
            notifications: { gifts: true, yearlyReceipts: true },
            createdAt: '2026-11-14T09:00:00Z',
            lastDeliveredAt: null,
            failuresInARow: 0,
          },
        });
      }
      return route.fulfill({ json: { delivered: 1, failed: 0, removed: 0 } });
    },
  );
  await rememberedDonorSession(page, { installed });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/darce/prehled');
  await expect(page.getByRole('button', { name: 'Otevřít v aplikaci banky' })).toBeEnabled();
  return sent;
}

async function payInTheBankAppAndComeBack(page: Page): Promise<void> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Otevřít v aplikaci banky' }).click();
  await download;
  await leaveTheApp(page);
  await comeBack(page);
}

test.describe('Given a signed-in donor in the installed app whose device has no notifications', () => {
  test('when they come back from their bank app and turn the notifications on, then the device asks once, the server registers it and a test notification comes', async ({
    page,
  }) => {
    const sent = await openOverview(page, { installed: true });

    await payInTheBankAppAndComeBack(page);

    const offer = page.getByRole('dialog', { name: OFFER_TITLE });
    await expect(offer).toContainText('Upozornění neříká jména ani částky.');
    expect((await deviceRecord(page)).permissionRequests).toBe(0);

    await offer.getByRole('button', { name: 'Zapnout' }).click();

    const done = page.getByRole('dialog', { name: 'Upozornění jsou zapnutá' });
    await expect(done).toBeVisible();
    expect((await deviceRecord(page)).permissionRequests).toBe(1);
    expect((await deviceRecord(page)).subscribedWith).toEqual([PUBLIC_KEY]);
    expect(sent.map((call) => `${call.method} ${call.path}`)).toEqual([
      `PUT ${PUSH}/device`,
      `POST ${PUSH}/test`,
    ]);

    await done.getByRole('button', { name: 'Hotovo' }).click();
    await expect(done).toBeHidden();
  });

  test('when they put the offer off, then nothing is asked and the next return from the bank app offers nothing', async ({
    page,
  }) => {
    await openOverview(page, { installed: true });
    await payInTheBankAppAndComeBack(page);

    await page
      .getByRole('dialog', { name: OFFER_TITLE })
      .getByRole('button', { name: 'Teď ne' })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await payInTheBankAppAndComeBack(page);
    await waitWhileNothingMayHappen(page, NOTHING_SHOWS_MS);

    await expect(page.getByRole('dialog')).toBeHidden();
    expect((await deviceRecord(page)).permissionRequests).toBe(0);
  });
});

test('Given a signed-in donor in a browser tab, when they come back from their bank app, then no offer appears and nothing is asked or sent', async ({
  page,
}) => {
  const sent = await openOverview(page, { installed: false });

  await payInTheBankAppAndComeBack(page);
  await waitWhileNothingMayHappen(page, NOTHING_SHOWS_MS);

  await expect(page.getByRole('dialog')).toBeHidden();
  expect(sent).toEqual([]);
  expect((await deviceRecord(page)).permissionRequests).toBe(0);
});
