import { expect, Page } from '@playwright/test';

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
  qrPngBase64:
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
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

export const paymentQr = {
  spayd: 'SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK',
  qrPngBase64:
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
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
  await page.getByRole('dialog').locator('.form-submit').click();
  await expect(page).toHaveURL(/\/darce\/prehled$/);
}
