import { expect, Page } from '@playwright/test';
import { PAYMENT_QR_500, SECOND_FACTOR_QR } from './qr-matrices';
import { noSignature } from './signature-image';

export const donor = {
  id: '01a18e56-bdb0-775a-bd0a-a60756831369',
  type: 'PERSON',
  name: 'Jana Nováková',
  companyIdentifier: null,
  address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
  email: 'jana@example.cz',
  preferredLocale: 'cs',
  variableSymbol: '1234567890',
  roles: ['DONOR'],
  registeredAt: '2026-10-17T10:00:00Z',
  hasPassword: true,
  secondFactor: { enabled: false, neededForAdministration: false },
};

export const administrator = {
  ...donor,
  roles: ['DONOR', 'ADMIN'],
  secondFactor: { enabled: true, neededForAdministration: false },
};

export const CHALLENGE = 'c'.repeat(43);

export function secondFactorRequired() {
  return {
    status: 401,
    contentType: 'application/problem+json',
    body: JSON.stringify({
      type: 'https://nfnn.cz/problems/auth/second-factor-required',
      title: 'Zadejte kód z aplikace',
      detail: 'Přihlášení dokončíte šestimístným kódem z ověřovací aplikace.',
      status: 401,
      challenge: CHALLENGE,
      challengeExpiresAt: '2026-10-17T10:05:00Z',
    }),
  };
}

export const secondFactorEnrolment = {
  secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  otpauthUri:
    'otpauth://totp/Nov%C3%A1%20nad%C4%9Bje:jana%40example.cz?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Nov%C3%A1%20nad%C4%9Bje&algorithm=SHA1&digits=6&period=30',
  qrCode: SECOND_FACTOR_QR,
};

export function session(status: number, user: typeof donor = donor) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      user,
      accessToken: 'token-1',
      accessTokenExpiresAt: '2026-10-17T10:15:00Z',
    }),
  };
}

export function problem(status: number, type: string, title: string, detail: string) {
  return {
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({ type: `https://nfnn.cz/problems/${type}`, title, detail, status }),
  };
}

export interface DonorApiMock {
  summary: unknown;
  list: unknown;
  receipts?: { singleFileName: string };
}

export const noDonations: DonorApiMock = {
  summary: {
    totalAmountMinor: 0,
    currency: 'CZK',
    count: 0,
    lastReceivedAt: null,
    byYear: [],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2026,
  },
  list: { items: [], totalAmountMinor: 0, currency: 'CZK', count: 0 },
};

export function donationItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '0192f0f1-0000-7000-8000-000000000001',
    receiptNumber: null,
    receivedAt: '2026-03-15',
    amountMinor: 50000,
    currency: 'CZK',
    purpose: 'Obecný příspěvek',
    status: 'RECEIVED',
    source: 'BANK_TRANSFER',
    pairedBy: 'VARIABLE_SYMBOL',
    senderAccount: null,
    confirmedSymbol: null,
    receiptAvailable: true,
    ...overrides,
  };
}

export function bankAccountItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '0192f0c4-0000-7000-8000-000000000001',
    accountNumber: '2900233333/2010',
    status: 'ACTIVE',
    verifiedOn: '2026-10-17',
    connectedFrom: null,
    disconnectedOn: null,
    donationCount: 0,
    totalAmountMinor: 0,
    currency: 'CZK',
    lastDonationOn: null,
    shared: false,
    pairingExcluded: false,
    verificationPaymentOn: null,
    symbolOffer: null,
    confirmedSymbols: [],
    ...overrides,
  };
}

export function receiptPdf(fileName: string) {
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
    },
    body: Buffer.from('%PDF-1.4\n%%EOF'),
  };
}

export const samplePngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==';

export const paymentQr = {
  spayd: 'SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK',
  qrCode: PAYMENT_QR_500,
  bankAccount: {
    accountNumber: '5544332217/2010',
    iban: 'CZ2620100000005544332217',
    recipientName: 'Nadační fond Nová naděje',
  },
};

export async function mockDonorApi(
  page: Page,
  donations: DonorApiMock = noDonations,
): Promise<void> {
  const receipts = donations.receipts;
  if (receipts) {
    await page.route(
      (url) => url.pathname === '/api/donations/me/receipts/yearly',
      (route) =>
        route.fulfill(
          receiptPdf(
            `potvrzeni-o-darech-${new URL(route.request().url()).searchParams.get('year')}.pdf`,
          ),
        ),
    );
    await page.route(
      (url) => /^\/api\/donations\/me\/[^/]+\/receipt$/.test(url.pathname),
      (route) => route.fulfill(receiptPdf(receipts.singleFileName)),
    );
  }
  await page.route(
    (url) => url.pathname === '/api/operations/setup',
    (route) => route.fulfill({ json: { required: false, codeRequired: true } }),
  );
  await page.route(
    (url) => url.pathname === '/api/admin/donations/receipt-signature',
    (route) => route.fulfill({ json: noSignature }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [], projects: [] } }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/payment-qr',
    (route) => route.fulfill({ json: paymentQr }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me/summary',
    (route) => route.fulfill({ json: donations.summary }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me',
    (route) => route.fulfill({ json: donations.list }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-check',
    (route) =>
      route.fulfill({
        status: route.request().method() === 'POST' ? 202 : 200,
        json: { bankDataAsOf: '2026-10-18T08:05:30Z', checking: false },
      }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) => route.fulfill({ json: { items: [] } }),
  );
  await page.route(
    (url) => url.pathname === '/api/donors/me/connections',
    (route) => route.fulfill({ json: { items: [] } }),
  );
  await page.route(
    (url) => url.pathname === '/api/donors/me/passkeys',
    (route) => route.fulfill({ json: { items: [] } }),
  );
}

export const connectionRequest =
  '/pripojeni?client_id=https%3A%2F%2Fclaude.ai%2F.well-known%2Foauth-client&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&scope=admin%3Aread%20admin%3Awrite&resource=http%3A%2F%2Flocalhost%3A4200%2Fmcp&state=xyz';

export const claudeConnection = {
  id: '0192f0f1-0000-7000-8000-000000000011',
  client: 'claude.ai',
  scopes: ['admin:read', 'admin:write'],
  grantedAt: '2026-10-23T06:00:00Z',
  lastUsedAt: '2026-10-23T09:30:00Z',
  expiresAt: '2026-11-06T09:30:00Z',
};

export async function mockConnectApi(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/donors/oauth/client',
    (route) => route.fulfill({ json: { host: 'claude.ai', name: 'Claude', loopback: false } }),
  );
  await page.route('https://claude.ai/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Claude</title>' }),
  );
}

export async function openSignInDialog(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.nav-login').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

export async function signIn(page: Page, user: typeof donor = donor): Promise<void> {
  await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200, user)));
  await openSignInDialog(page);
  await page.locator('#login-email').fill('jana@example.cz');
  await page.locator('#login-password').fill('correct horse battery');
  await page.getByRole('dialog').locator('.ui-button--block').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.nav-login', { hasText: 'Můj přehled' }).click();
  await expect(page).toHaveURL(/\/darce\/prehled$/);
}

function adminSetting(
  name: string,
  group: string,
  value: string | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    name,
    group,
    secret: false,
    value,
    configured: value !== null,
    stored: false,
    unreadable: false,
    ...overrides,
  };
}

export const adminSettings = {
  settings: [
    adminSetting('PUBLIC_URL', 'SITE', 'https://nfnn.cz', { stored: true }),
    adminSetting('MAIL_HOST', 'MAIL', 'smtp-relay.brevo.com', { stored: true }),
    adminSetting('MAIL_PORT', 'MAIL', '587', { stored: true }),
    adminSetting('MAIL_USERNAME', 'MAIL', 'abc@smtp-brevo.com', { stored: true }),
    adminSetting('MAIL_PASSWORD', 'MAIL', null, { secret: true, configured: true, stored: true }),
    adminSetting('MAIL_AUTH', 'MAIL', 'true', { stored: true }),
    adminSetting('MAIL_STARTTLS', 'MAIL', 'true', { stored: true }),
    adminSetting('MAIL_FROM', 'MAIL', 'info@nfnn.cz', { stored: true }),
    adminSetting('CONTACT_RECIPIENT', 'MAIL', 'info@nfnn.cz', { stored: true }),
    adminSetting('FIO_TOKEN', 'BANK', null, { secret: true, configured: true, stored: true }),
    adminSetting('FIO_HISTORY_FROM', 'BANK', null),
    adminSetting('PAIRING_EXCLUDED_ACCOUNTS', 'BANK', null),
    adminSetting('RECEIPT_SIGNATORY_NAME', 'RECEIPTS', 'Pavel Znamenáček'),
    adminSetting('RECEIPT_SIGNATORY_ROLE', 'RECEIPTS', 'předseda správní rady'),
    adminSetting('RECEIPT_FIRST_YEAR', 'RECEIPTS', '2026'),
  ],
  secretsCanBeStored: true,
};

export async function openDonorSection(page: Page, name: string): Promise<void> {
  const link = page
    .getByRole('navigation', { name: 'Můj účet' })
    .getByRole('link', { name, exact: true });
  await link.click();
  await expect(link).toHaveAttribute('aria-current', 'page');
}
