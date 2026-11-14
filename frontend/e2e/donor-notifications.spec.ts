import { expect, test } from './fixtures';
import { mockDonorApi, openDonorSection, signIn } from './donor-session';
import {
  DEVICE_AUTH,
  DEVICE_ENDPOINT,
  DEVICE_P256DH,
  deviceRecord,
  fakePushDevice,
} from './push-device';

const PUSH = '/api/operations/push';
const PUBLIC_KEY = `B${'E'.repeat(86)}`;

function device(notifications = { gifts: true, yearlyReceipts: true }) {
  return {
    service: 'google',
    notifications,
    createdAt: '2026-11-12T09:00:00Z',
    lastDeliveredAt: null,
    failuresInARow: 0,
  };
}

test.describe('Given a donor on Údaje a zabezpečení of a browser that can receive notifications', () => {
  test('when they turn the notifications on, switch gifts off and turn them off again, then each step reaches the server and the card says what happened', async ({
    page,
  }) => {
    await fakePushDevice(page, { permission: 'default', permissionAnswer: 'granted' });
    await mockDonorApi(page);
    let current: ReturnType<typeof device> | null = null;
    await page.route(
      (url) => url.pathname === PUSH,
      (route) =>
        route.fulfill({
          json: {
            publicKey: PUBLIC_KEY,
            deviceSession: true,
            device: current,
            devices: current ? ['019a5a3c-0000-7000-8000-000000000001'] : [],
          },
        }),
    );
    const sent: { method: string; path: string; body: unknown }[] = [];
    await page.route(
      (url) => url.pathname.startsWith(`${PUSH}/`),
      async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        sent.push({ method: request.method(), path, body: request.postDataJSON() ?? null });
        if (path === `${PUSH}/device` && request.method() === 'PUT') {
          current = device();
          return route.fulfill({ json: current });
        }
        if (path === `${PUSH}/device/notifications`) {
          current = device(request.postDataJSON());
          return route.fulfill({ json: current });
        }
        if (path === `${PUSH}/device` && request.method() === 'DELETE') {
          current = null;
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ json: { delivered: 1, failed: 0, removed: 0 } });
      },
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const card = page.locator('.notifications');
    await expect(card.getByRole('heading', { name: 'Upozornění' })).toBeVisible();
    await card.getByRole('button', { name: 'Zapnout na tomto zařízení' }).click();

    await expect(card.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Upozornění jsme na tomto zařízení zapnuli. Zkušební upozornění jsme předali k doručení.',
    );
    await expect(card.getByRole('switch', { name: 'Dar dorazil' })).toBeChecked();
    await expect(page.locator('.devices .device-notified')).toHaveText(['dostává upozornění']);

    await card.getByRole('switch', { name: 'Dar dorazil' }).click();
    await expect(card.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Uloženo: Dar dorazil – vypnuto.',
    );

    await card.getByRole('button', { name: 'Vypnout na tomto zařízení' }).click();
    await expect(card.getByRole('button', { name: 'Zapnout na tomto zařízení' })).toBeVisible();
    await expect(page.locator('.devices .device-notified')).toHaveCount(0);

    expect(sent).toEqual([
      {
        method: 'PUT',
        path: `${PUSH}/device`,
        body: { endpoint: DEVICE_ENDPOINT, keys: { p256dh: DEVICE_P256DH, auth: DEVICE_AUTH } },
      },
      { method: 'POST', path: `${PUSH}/test`, body: {} },
      {
        method: 'PUT',
        path: `${PUSH}/device/notifications`,
        body: { gifts: false, yearlyReceipts: true },
      },
      { method: 'DELETE', path: `${PUSH}/device`, body: null },
    ]);
    expect((await deviceRecord(page)).unsubscribed).toBe(1);
  });
});
