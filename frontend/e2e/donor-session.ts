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
};

export function session(status: number) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ user: donor, accessToken: 'token-1', accessTokenExpiresAt: '2026-10-17T10:15:00Z' }),
  };
}

export function problem(status: number, type: string, title: string, detail: string) {
  return {
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({ type: `https://novanadeje.cz/problems/${type}`, title, detail, status }),
  };
}

export const noDonations = {
  summary: { totalAmountMinor: 0, currency: 'CZK', count: 0, lastReceivedAt: null, byYear: [] },
  list: { items: [], totalAmountMinor: 0, currency: 'CZK', count: 0 },
};

export const paymentQr = {
  spayd: 'SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK',
  qrPngBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
  bankAccount: { accountNumber: '5544332217/2010', iban: 'CZ2620100000005544332217', recipientName: 'Nadační fond Nová naděje' },
};

export async function mockDonorApi(page: Page, donations: { summary: unknown; list: unknown } = noDonations): Promise<void> {
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
}

export async function openSignInDialog(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.nav-login').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

export async function signIn(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
  await openSignInDialog(page);
  await page.locator('#login-email').fill('jana@example.cz');
  await page.locator('#login-password').fill('correct horse battery');
  await page.getByRole('dialog').locator('.form-submit').click();
  await expect(page).toHaveURL(/\/donor\/prehled$/);
}
