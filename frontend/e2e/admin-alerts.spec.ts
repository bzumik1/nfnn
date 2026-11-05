import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, session } from './donor-session';
import {
  alertMessage,
  DEVICE_AUTH,
  DEVICE_ENDPOINT,
  DEVICE_P256DH,
  deviceRecord,
  fakePushDevice,
  workerPosts,
} from './push-device';

const PUSH = '/api/admin/operations/push';
const PUBLIC_KEY = `B${'E'.repeat(86)}`;
const OLD_PUBLIC_KEY = `B${'D'.repeat(86)}`;

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'push-this-device',
    service: 'google',
    alerts: { bankImport: true, backups: true, mail: true },
    createdAt: '2026-11-01T09:00:00Z',
    lastDeliveredAt: null,
    failuresInARow: 0,
    current: true,
    ...overrides,
  };
}

function pushView(overrides: Record<string, unknown> = {}) {
  return {
    publicKey: PUBLIC_KEY,
    deviceSession: true,
    subscriptions: [],
    openAlerts: [],
    ...overrides,
  };
}

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

async function servePush(page: Page, view: object): Promise<void> {
  await page.route(
    (url) => url.pathname === PUSH,
    (route) => route.fulfill({ json: view }),
  );
}

test.describe('Given an administrator on the alerts page of a device with a service worker', () => {
  test.beforeEach(async ({ page }) => {
    await fakePushDevice(page);
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they turn the alerts on, change a switch, send a test and turn them off, then each step goes to the server and the page says what happened', async ({
    page,
  }) => {
    let subscribed = false;
    await page.route(
      (url) => url.pathname === PUSH,
      (route) =>
        route.fulfill({
          json: pushView({
            subscriptions: subscribed ? [subscription()] : [],
            openAlerts: [{ area: 'mail', since: '2026-11-04T05:15:00Z' }],
          }),
        }),
    );
    const sent: { method: string; path: string; body: unknown }[] = [];
    await page.route(
      (url) => url.pathname.startsWith(`${PUSH}/`),
      (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        sent.push({ method: request.method(), path, body: request.postDataJSON() });
        if (path === `${PUSH}/subscriptions`) {
          subscribed = true;
          return route.fulfill({ status: 201, json: subscription() });
        }
        if (request.method() === 'DELETE') {
          subscribed = false;
        }
        if (path.endsWith('/alerts')) {
          return route.fulfill({ json: subscription({ alerts: request.postDataJSON() }) });
        }
        if (path === `${PUSH}/test`) {
          return route.fulfill({ json: { delivered: 1, failed: 0, removed: 0 } });
        }
        return route.fulfill({ status: 204 });
      },
    );

    await page.goto('/sprava/upozorneni');

    await expect(page).toHaveTitle('Upozornění na telefon | Správa | Nová naděje – nadační fond');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Upozornění na telefon' }),
    ).toBeFocused();
    const watched = page.getByRole('region', { name: 'Co se hlídá' });
    await expect(watched.getByRole('link')).toHaveText([
      /Import plateb z banky\s*Bez poruchy/,
      /Zálohy\s*Bez poruchy/,
      /Odesílání e-mailů\s*Nefunguje od 04\. 11\. 2026 06:15/,
    ]);
    await expect(watched.getByRole('link').nth(2)).toHaveAttribute('href', '/sprava/nastaveni');
    expect((await deviceRecord(page)).badges).toContain(1);

    const device = page.getByRole('region', { name: 'Toto zařízení' });
    await device.getByRole('button', { name: 'Zapnout upozornění na tomto zařízení' }).click();

    await expect(device.getByRole('status')).toHaveText(
      /Upozornění jsme na tomto zařízení zapnuli\./,
    );
    await expect(device.getByRole('heading', { name: 'Toto zařízení' })).toBeFocused();
    expect((await deviceRecord(page)).permissionRequests).toBe(1);
    expect((await deviceRecord(page)).subscribedWith).toEqual([PUBLIC_KEY]);
    expect(sent[0]).toEqual({
      method: 'POST',
      path: `${PUSH}/subscriptions`,
      body: { endpoint: DEVICE_ENDPOINT, keys: { p256dh: DEVICE_P256DH, auth: DEVICE_AUTH } },
    });

    await device.getByRole('checkbox', { name: 'Zálohy' }).uncheck();

    await expect(device.getByRole('status')).toHaveText(
      'Uloženo pro toto zařízení: Zálohy – vypnuto.',
    );
    expect(sent[1]).toEqual({
      method: 'PUT',
      path: `${PUSH}/subscriptions/push-this-device/alerts`,
      body: { bankImport: true, backups: false, mail: true },
    });

    const test = page.getByRole('region', { name: 'Zkušební upozornění' });
    await test
      .getByRole('button', { name: 'Poslat zkušební upozornění na všechna moje zařízení' })
      .click();

    await expect(test.getByRole('status')).toHaveText(
      /^Zkušební upozornění jsme předali k doručení na 1 zařízení\./,
    );

    await device.getByRole('button', { name: 'Vypnout na tomto zařízení' }).click();

    await expect(device.getByRole('status')).toHaveText(
      'Upozornění jsme na tomto zařízení vypnuli.',
    );
    expect(sent.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `${PUSH}/subscriptions/push-this-device`,
    });
    expect((await deviceRecord(page)).unsubscribed).toBe(1);
    await expect(
      device.getByRole('button', { name: 'Zapnout upozornění na tomto zařízení' }),
    ).toBeVisible();
  });

  test('when another device of theirs is listed, then its switches and its removal work on its own', async ({
    page,
  }) => {
    const phone = subscription({
      id: 'push-phone',
      service: 'apple',
      current: false,
      createdAt: '2026-10-30T10:00:00Z',
      lastDeliveredAt: '2026-11-03T09:05:00Z',
      failuresInARow: 2,
    });
    await servePush(page, pushView({ subscriptions: [phone] }));
    await page.route(
      (url) => url.pathname === `${PUSH}/subscriptions/push-phone/alerts`,
      (route) => route.fulfill({ json: { ...phone, alerts: route.request().postDataJSON() } }),
    );
    await page.route(
      (url) => url.pathname === `${PUSH}/subscriptions/push-phone`,
      (route) => route.fulfill({ status: 204 }),
    );

    await page.goto('/sprava/upozorneni');

    const others = page.getByRole('region', { name: 'Další zařízení' });
    const phoneSwitches = others.getByRole('group', { name: 'Apple, zapnuto 30. 10. 2026' });
    await expect(phoneSwitches).toContainText('Naposledy doručeno 03. 11. 2026 10:05.');
    await expect(phoneSwitches).toContainText('Nedoručeno 2× po sobě.');

    await phoneSwitches.getByRole('checkbox', { name: 'Import plateb z banky' }).uncheck();

    await expect(others.getByRole('status')).toHaveText(
      'Uloženo pro Apple (30. 10. 2026): Import plateb z banky – vypnuto.',
    );

    await others
      .getByRole('button', { name: 'Odebrat zařízení Apple, zapnuto 30. 10. 2026' })
      .click();

    await expect(others.getByRole('status')).toHaveText(
      'Zařízení Apple jsme odebrali; upozornění na ně už nechodí.',
    );
    await expect(others).toContainText('Na jiném zařízení upozornění zapnutá nemáte.');
    expect((await deviceRecord(page)).unsubscribed).toBe(0);
  });

  test('when an alert arrives while the app is open, then the icon badge shows the open alerts', async ({
    page,
  }) => {
    await servePush(page, pushView());
    await page.goto('/sprava/upozorneni');
    await expect(page.getByRole('region', { name: 'Co se hlídá' })).toContainText('Bez poruchy');
    await expect.poll(async () => (await deviceRecord(page)).badges).toEqual([null, null]);

    await workerPosts(page, {
      type: 'PUSH',
      data: alertMessage('backups-outage', 2),
    });
    await workerPosts(page, { type: 'PUSH', data: { kind: 'test', count: 'many' } });
    await workerPosts(page, {
      type: 'PUSH',
      data: alertMessage('backups-recovered', 0),
    });

    await expect.poll(async () => (await deviceRecord(page)).badges).toEqual([null, null, 2, null]);
  });

  test('when an alert notification is clicked while the app is open, then the app opens the page of its kind and never an address from the message', async ({
    page,
  }) => {
    await servePush(page, pushView());
    await page.goto('/sprava/upozorneni');
    await expect(page.getByRole('region', { name: 'Co se hlídá' })).toContainText('Bez poruchy');
    const clicked = alertMessage('backups-outage', 1, 'https://elsewhere.example/');

    await workerPosts(page, {
      type: 'NOTIFICATION_CLICK',
      data: { action: '', notification: clicked.notification },
    });

    await expect(page).toHaveURL(/\/sprava\/zalohy$/);
  });

  test('when the sign-in names no device, then the page says so and never asks the browser for its permission', async ({
    page,
  }) => {
    await servePush(page, pushView({ deviceSession: false }));

    await page.goto('/sprava/upozorneni');

    const device = page.getByRole('region', { name: 'Toto zařízení' });
    await expect(device).toContainText(
      'Toto přihlášení zatím nerozlišuje zařízení, a proto na něm upozornění zapnout nejde.',
    );
    await expect(device.getByRole('button')).toHaveCount(0);
    expect((await deviceRecord(page)).permissionRequests).toBe(0);
  });

  test('when the administration opens on any page, then the icon badge shows the open alerts', async ({
    page,
  }) => {
    await servePush(
      page,
      pushView({ openAlerts: [{ area: 'backups', since: '2026-11-04T05:15:00Z' }] }),
    );

    await page.goto('/sprava/zalohy');

    await expect.poll(async () => (await deviceRecord(page)).badges).toEqual([1]);
  });
});

test.describe('Given an administrator on the alerts page without a service worker', () => {
  test('when the page opens, then it explains why alerts cannot be turned on here', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
    await servePush(page, pushView());

    await page.goto('/sprava/upozorneni');

    await expect(page.getByRole('region', { name: 'Toto zařízení' })).toContainText(
      'Prohlížeč zatím nespustil část webu, která upozornění doručuje.',
    );
    await expect(
      page.getByRole('button', { name: 'Zapnout upozornění na tomto zařízení' }),
    ).toHaveCount(0);
  });

  test('when the side panel is opened, then the page sits among the occasional sections after the backups', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
    await servePush(page, pushView());
    await page.goto('/sprava');

    const panel = page.getByRole('navigation', { name: 'Správa' });
    await panel.getByRole('link', { name: 'Upozornění na telefon' }).click();

    await expect(page).toHaveURL(/\/sprava\/upozorneni$/);
  });
});

test.describe('Given an administrator whose browser and server disagree about the subscription', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === `${PUSH}/subscriptions`,
      (route) => route.fulfill({ status: 201, json: subscription() }),
    );
  });

  test('when the server lists this device but the browser lost its subscription, then the page says so and turning on again subscribes it', async ({
    page,
  }) => {
    await fakePushDevice(page);
    await rememberedSession(page);
    await servePush(page, pushView({ subscriptions: [subscription()] }));

    await page.goto('/sprava/upozorneni');

    const device = page.getByRole('region', { name: 'Toto zařízení' });
    await expect(device).toContainText('Prohlížeč ale upozornění od tohoto webu už nepřijímá');
    await device.getByRole('button', { name: 'Zapnout znovu' }).click();

    await expect(device.getByRole('status')).toHaveText(
      /Upozornění jsme na tomto zařízení zapnuli\./,
    );
    await expect(device).not.toContainText('už nepřijímá');
    expect((await deviceRecord(page)).subscribedWith).toEqual([PUBLIC_KEY]);
  });

  test('when the browser holds a subscription under an older server key, then turning on ends it and subscribes under the current key', async ({
    page,
  }) => {
    await fakePushDevice(page, { subscribedWith: OLD_PUBLIC_KEY });
    await rememberedSession(page);
    await servePush(page, pushView());

    await page.goto('/sprava/upozorneni');
    const device = page.getByRole('region', { name: 'Toto zařízení' });
    await device.getByRole('button', { name: 'Zapnout upozornění na tomto zařízení' }).click();

    await expect(device.getByRole('status')).toHaveText(/zapnuli/);
    const record = await deviceRecord(page);
    expect(record.unsubscribed).toBe(1);
    expect(record.subscribedWith).toEqual([PUBLIC_KEY]);
  });

  test('when the browser holds a subscription under the current key, then turning on keeps it', async ({
    page,
  }) => {
    await fakePushDevice(page, { subscribedWith: PUBLIC_KEY });
    await rememberedSession(page);
    await servePush(page, pushView());

    await page.goto('/sprava/upozorneni');
    const device = page.getByRole('region', { name: 'Toto zařízení' });
    await device.getByRole('button', { name: 'Zapnout upozornění na tomto zařízení' }).click();

    await expect(device.getByRole('status')).toHaveText(/zapnuli/);
    expect((await deviceRecord(page)).unsubscribed).toBe(0);
  });
});
