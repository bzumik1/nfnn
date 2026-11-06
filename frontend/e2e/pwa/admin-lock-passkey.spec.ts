import type { BrowserContext, Page } from '@playwright/test';
import { administrator, mockDonorApi, session } from '../donor-session';
import { expect, pwaTest as test } from './pwa-fixtures';

const REPORT = '/api/admin/donations/report';
const UNLOCK = '/api/admin/donors/devices/current/unlock';
const RECORD = '/api/admin/donors/devices/current/administration-copy';
const LOCKED = 'Správa je zamčená';

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
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => administrationWraps(await idbDump())).toEqual(['password']);

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
