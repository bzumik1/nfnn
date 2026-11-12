import type { BrowserContext, Page } from '@playwright/test';
import { rowsSha256 } from '../../src/app/features/donations/sync/canonical-rows';
import { administrator, mockDonorApi, session } from '../donor-session';
import { comeBack, leaveTheApp } from '../page-visibility';
import { expect, pwaTest as test } from './pwa-fixtures';

const REPORT = '/api/admin/donations/report';
const UNLOCK = '/api/admin/donors/devices/current/unlock';
const RECORD = '/api/admin/donors/devices/current/administration-copy';
const LOCKED = 'Správa je zamčená';
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const APP_API_OFFLINE =
  /^Failed to load resource: (?:the server responded with a status of 504 \(Gateway Timeout\)|net::ERR_INTERNET_DISCONNECTED) \(http:\/\/localhost:\d+\/api\//;

const reportView = {
  settings: {
    recipients: ['info@nfnn.cz'],
    sendDay: 1,
    sendHour: 7,
    sections: { donors: true, donations: true, unpairedPayments: true, bankImport: true },
    changedAt: null,
    version: '0f1e2d3c4b5a6978',
  },
  sentReports: [{ month: '2026-09', sentAt: '2026-10-01T05:00:12Z' }],
  nextReport: { month: '2026-10', dueOn: '2026-11-01' },
  lastEndedMonth: '2026-10',
};

function userHandleBytes(id: string): number[] {
  const hex = id.replace(/-/g, '');
  return Array.from({ length: hex.length / 2 }, (_, index) =>
    parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

async function mockAdministration(context: BrowserContext, unlocks: string[]): Promise<void> {
  await mockDonorApi(context);
  await context.route(
    (url) => url.pathname === '/api/donors/auth/passkey/options',
    (route) =>
      route.fulfill({
        json: {
          challenge: 'c'.repeat(43),
          rpId: 'localhost',
          timeout: 60_000,
          userVerification: 'required',
          allowCredentials: [],
        },
      }),
  );
  await context.route(
    (url) => url.pathname === '/api/donors/auth/passkey',
    (route) => route.fulfill(session(200, administrator)),
  );
  await context.route(
    (url) => url.pathname === '/api/donors/auth/refresh',
    (route) => route.fulfill(session(200, administrator)),
  );
  await context.route(
    (url) => url.pathname === RECORD,
    (route) => route.fulfill({ status: 204 }),
  );
  await context.route(
    (url) => url.pathname === UNLOCK,
    (route) => {
      unlocks.push(route.request().url());
      return route.fulfill({ status: 204 });
    },
  );
  await context.route(
    (url) => url.pathname === '/api/admin/donations/sync',
    (route) =>
      route.fulfill({
        json: {
          subject: administrator.id,
          administrator: true,
          summary: { today: '2026-11-05', byYear: [] },
          chunks: [],
        },
      }),
  );
  await context.route(
    (url) => url.pathname === '/api/admin/donors/sync',
    (route) =>
      route.fulfill({ json: { subject: administrator.id, administrator: true, chunks: [] } }),
  );
  await context.route(
    (url) => url.pathname === '/api/admin/content/people/me',
    (route) => route.fulfill({ json: { member: null } }),
  );
  await context.route(
    (url) => url.pathname === REPORT,
    (route) => route.fulfill({ json: reportView }),
  );
  await context.route(
    (url) => url.pathname === '/api/admin/operations/push',
    (route) =>
      route.fulfill({
        json: {
          publicKey: `B${'E'.repeat(86)}`,
          deviceSession: true,
          subscriptions: [],
          openAlerts: [],
        },
      }),
  );
}

const PAYMENT = {
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

async function serveDonationsCopy(
  context: BrowserContext,
  held: readonly { readonly id: string; readonly rows: readonly unknown[] }[],
): Promise<void> {
  const chunks = await Promise.all(
    held.map(async ({ id, rows }) => ({
      id,
      rowsSha256: await rowsSha256(rows),
      count: rows.length,
      rows,
    })),
  );
  const head = {
    subject: administrator.id,
    administrator: true,
    summary: { today: '2026-11-05', byYear: [] },
  };
  await context.route(
    (url) => url.pathname === '/api/admin/donations/sync',
    (route) =>
      route.fulfill({
        json: {
          ...head,
          chunks: chunks.map(({ id, rowsSha256: digest, count }) => ({
            id,
            rowsSha256: digest,
            count,
          })),
        },
      }),
  );
  await context.route(
    (url) => url.pathname === '/api/admin/donations/sync/chunks',
    (route) => {
      const ids = (new URL(route.request().url()).searchParams.get('ids') ?? '').split(',');
      return route.fulfill({
        json: {
          ...head,
          chunks: chunks.filter((chunk) => ids.includes(chunk.id)),
          missing: ids.filter((id) => !chunks.some((chunk) => chunk.id === id)),
        },
      });
    },
  );
}

async function createAdministratorPasskey(page: Page): Promise<void> {
  await page.evaluate(async (userId) => {
    const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
    await navigator.credentials.create({
      publicKey: {
        challenge: bytes('a challenge of the e2e test'),
        rp: { id: location.hostname, name: 'NFNN e2e' },
        user: {
          id: new Uint8Array(userId),
          name: 'jana@example.cz',
          displayName: 'Jana Nováková',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        extensions: { prf: {} },
      },
    });
  }, userHandleBytes(administrator.id));
}

interface StoredEntry {
  readonly kind?: string;
  readonly wraps?: readonly { readonly kind: string }[];
}

function administrationWraps(dump: Record<string, Record<string, readonly unknown[]>>): string[] {
  return Object.values(dump)
    .flatMap((stores) => Object.values(stores).flat())
    .filter((record): record is StoredEntry => (record as StoredEntry)?.kind === 'administration')
    .flatMap((entry) => (entry.wraps ?? []).map((wrap) => wrap.kind));
}

test.describe('Given an administrator who signs in with a passkey that supports PRF', () => {
  test('when the app starts again, then the administration is locked and the passkey alone unlocks it on this device, without asking the server', async ({
    page,
    context,
    virtualAuthenticator,
    idbDump,
    swReady,
  }) => {
    const unlocks: string[] = [];
    await mockAdministration(context, unlocks);
    await page.goto('/');
    await swReady();
    await createAdministratorPasskey(page);
    expect(await virtualAuthenticator.credentialCount()).toBe(1);

    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Přihlásit se přístupovým klíčem' })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => administrationWraps(await idbDump())).toEqual(['prf']);

    await page.goto('/sprava/prehledy');
    await expect(page.getByRole('heading', { level: 1, name: LOCKED })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Měsíční e-mail' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Odemknout přístupovým klíčem' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Měsíční e-mail' })).toBeVisible();
    expect(unlocks).toEqual([]);
  });
});

test.describe('Given an administrator who signs in with the password and has a passkey on the account', () => {
  test('when the app starts again, then the passkey of the account is offered first, the server checks it and the copy is kept under that passkey alone', async ({
    page,
    context,
    virtualAuthenticator,
    idbDump,
    swReady,
  }) => {
    const unlocks: string[] = [];
    const sent: unknown[] = [];
    await mockAdministration(context, unlocks);
    await context.route(
      (url) => url.pathname === UNLOCK,
      (route) => {
        sent.push(route.request().postDataJSON());
        return route.fulfill({ status: 204 });
      },
    );
    await context.route(
      (url) => url.pathname === '/api/donors/auth/login',
      (route) => route.fulfill(session(200, administrator)),
    );
    await context.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: '0190c3a2-7b1e-7cc1-8a52-0000000000aa',
                name: 'iPhone',
                createdAt: '2026-11-01T08:00:00Z',
                lastUsedAt: null,
              },
            ],
          },
        }),
    );
    await page.goto('/');
    await swReady();
    await createAdministratorPasskey(page);
    expect(await virtualAuthenticator.credentialCount()).toBe(1);

    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    const stored = context.waitForEvent('request', (request) => request.url().endsWith(RECORD));
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await stored;
    expect(administrationWraps(await idbDump())).toEqual(['password']);

    await page.goto('/sprava/prehledy');
    await expect(page.getByRole('heading', { level: 1, name: LOCKED })).toBeVisible();
    const unlockButtons = page.locator('.lock-actions').getByRole('button');
    await expect(unlockButtons).toHaveText(['Odemknout přístupovým klíčem', 'Použít heslo']);
    await unlockButtons.first().click();

    await expect(page.getByRole('heading', { level: 1, name: 'Měsíční e-mail' })).toBeVisible();
    expect(sent).toEqual([
      {
        passkey: {
          challenge: 'c'.repeat(43),
          credential: expect.objectContaining({ type: 'public-key' }),
        },
      },
    ]);
    await expect.poll(async () => administrationWraps(await idbDump())).toEqual(['prf']);
  });
});

test.describe('Given an administrator whose copy of the administration is kept under a passkey that supports PRF', () => {
  test.use({ allowedConsoleErrors: [APP_API_OFFLINE] });

  test('when the connection is gone and the administration locks, then the passkey alone unlocks it again and the payments page shows the payment from the copy, without asking the server', async ({
    page,
    context,
    virtualAuthenticator,
    idbDump,
    swReady,
    goOffline,
  }) => {
    await mockAdministration(context, []);
    await context.route(
      (url) => url.pathname === '/api/live',
      (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: '' }),
    );
    await context.route(
      (url) => url.pathname === '/api/admin/donations/payments',
      (route) => route.fulfill({ json: { year: null, availableYears: [], items: [] } }),
    );
    await context.route(
      (url) => url.pathname === '/api/donations/bank-logos',
      (route) => route.fulfill({ json: { items: [] } }),
    );
    await serveDonationsCopy(context, [{ id: 'payments:2026-10', rows: [PAYMENT] }]);
    const asked: string[] = [];
    context.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/admin/')) {
        asked.push(new URL(request.url()).pathname);
      }
    });
    await page.clock.install();
    await page.goto('/');
    await swReady();
    await createAdministratorPasskey(page);
    expect(await virtualAuthenticator.credentialCount()).toBe(1);
    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Přihlásit se přístupovým klíčem' })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => administrationWraps(await idbDump())).toEqual(['prf']);
    await page.goto('/sprava/platby');
    await page.getByRole('button', { name: 'Odemknout přístupovým klíčem' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeVisible();

    await expect(page.getByRole('row').filter({ hasText: 'Nováková Jana' })).toBeVisible();
    await goOffline();
    asked.length = 0;
    await leaveTheApp(page);
    await page.clock.fastForward(FIVE_MINUTES_MS);
    await comeBack(page);

    await expect(page.getByRole('heading', { level: 1, name: LOCKED })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Offline/ })).toBeVisible();
    await page.getByRole('button', { name: 'Odemknout přístupovým klíčem' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Nováková Jana' })).toBeVisible();
    expect(asked.filter((path) => path === UNLOCK)).toEqual([]);
  });
});
