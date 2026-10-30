import { Request } from '@playwright/test';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';
import {
  CHANGED_AMOUNT,
  KEY_LIST,
  keepKeyList,
  keptKeyList,
  LIST_WITHOUT_THE_KEY,
  REVOKED_KEY_LIST,
  scanAfterLoad,
  serveReceiptKeys,
  serveReceiptStatus,
  SINGLE_RECEIPT,
  TAMPERED_KEY_LIST,
  withoutWebCryptoEd25519,
  YEARLY_RECEIPT,
} from './receipt-verification';

const SIGNED = 'Podepsáno fondem Nová naděje';
const DONOR_NAME = 'Marie Dvořáková';

test.describe('Given a visitor who scans the verification QR of a receipt', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when the fund keeps the receipt as valid, then the page shows the signed data and the status line, and only the key list and the digest leave the browser', async ({
    page,
  }) => {
    await serveReceiptKeys(page);
    await serveReceiptStatus(page, 'active');
    const requests: Request[] = [];
    page.on('request', (request) => requests.push(request));

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(SIGNED);
    await expect(heading).toBeFocused();
    await expect(page.getByText('Fond toto potvrzení vede jako platné.')).toBeVisible();
    await expect(page.locator('dd').filter({ hasText: DONOR_NAME })).toBeVisible();
    await expect(page.locator('dd').filter({ hasText: '2 500 Kč' })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    expect(await keptKeyList(page)).toEqual(KEY_LIST);

    const api = requests.filter((request) => new URL(request.url()).pathname.startsWith('/api/'));
    expect(
      api.map((request) => `${request.method()} ${new URL(request.url()).pathname}`).sort(),
    ).toEqual([
      'GET /api/donations/receipt-keys',
      'GET /api/operations/setup',
      'POST /api/donations/receipts/status',
    ]);
    const keys = api.find((request) => request.url().endsWith('/receipt-keys'));
    expect(await keys?.headerValue('cache-control')).toBe('no-cache');
    const status = api.find((request) => request.method() === 'POST');
    expect(status?.postDataJSON()).toEqual({ digest: SINGLE_RECEIPT.signedSha256 });
    for (const request of requests) {
      expect(request.url()).not.toContain(SINGLE_RECEIPT.fragment.slice(0, 17));
      expect(request.postData() ?? '').not.toContain(SINGLE_RECEIPT.fragment.slice(0, 17));
      expect(request.postData() ?? '').not.toContain(DONOR_NAME);
      expect(await request.headerValue('authorization')).toBeNull();
    }
  });

  for (const [status, heading] of [
    ['unknown', 'Fond toto potvrzení ve své evidenci nevede'],
    ['replaced', 'Fond toto potvrzení nahradil novějším'],
    ['withdrawn', 'Fond toto potvrzení zrušil'],
  ]) {
    test(`when the fund answers ${status}, then the page is not green and its heading says so`, async ({
      page,
    }) => {
      await serveReceiptKeys(page);
      await serveReceiptStatus(page, status);

      await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.getByText(SIGNED)).toHaveCount(0);
      await expect(page.locator('.ui-status__icon--success')).toHaveCount(0);
    });
  }

  test('when a yearly receipt is scanned, then every gift is listed with the total', async ({
    page,
  }) => {
    await serveReceiptKeys(page);
    await serveReceiptStatus(page, 'active');

    await page.goto(`/overit#${YEARLY_RECEIPT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);
    await expect(page.getByRole('table', { name: 'Jednotlivé dary (12)' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(12);
  });

  test('when the data in the code were changed, then the page says the signature does not match', async ({
    page,
  }) => {
    await serveReceiptKeys(page);

    await page.goto(`/overit#${CHANGED_AMOUNT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Neověřeno: podpis neodpovídá údajům',
    );
    await expect(page.locator('dl')).toHaveCount(0);
  });

  test('when the key list names the key with another public key, then the code is not verified', async ({
    page,
  }) => {
    await serveReceiptKeys(page, TAMPERED_KEY_LIST);

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Neověřeno: kód nepodepsal žádný klíč fondu',
    );
  });

  test('when the fund revoked the key, then the code is not verified however it was signed', async ({
    page,
  }) => {
    await serveReceiptKeys(page, REVOKED_KEY_LIST);

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Neověřeno: fond tento klíč zneplatnil',
    );
  });

  test('when the code was not read whole, then the page says the link is incomplete and asks nothing', async ({
    page,
  }) => {
    const keys: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/donations/')) {
        keys.push(request.url());
      }
    });

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment.slice(0, 60)}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Odkaz je neúplný');
    expect(keys).toEqual([]);
  });

  test('when the browser has no Ed25519 in WebCrypto, then the fallback verifies the code', async ({
    page,
  }) => {
    await withoutWebCryptoEd25519(page);
    await serveReceiptKeys(page);
    await serveReceiptStatus(page, 'active');
    const scripts: Promise<string>[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.js')) {
        scripts.push(response.text());
      }
    });

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);
    expect((await Promise.all(scripts)).some((script) => script.includes('edwards25519'))).toBe(
      true,
    );
  });

  test('when the browser has Ed25519 in WebCrypto, then the fallback library is never loaded', async ({
    page,
  }) => {
    await serveReceiptKeys(page);
    await serveReceiptStatus(page, 'active');
    const scripts: Promise<string>[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.js')) {
        scripts.push(response.text());
      }
    });

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);
    expect((await Promise.all(scripts)).some((script) => script.includes('edwards25519'))).toBe(
      false,
    );
  });
});

test.describe('Given a visitor whose connection drops after the page has loaded', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when the keys are kept from an earlier visit, then the code is verified offline and the page says a replacement cannot be seen', async ({
    page,
    context,
  }) => {
    await keepKeyList(page);
    await page.goto('/overit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');
    const verification: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/donations/')) {
        verification.push(request.url());
      }
    });

    await context.setOffline(true);
    await scanAfterLoad(page, SINGLE_RECEIPT);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);
    await expect(
      page.getByText(
        'Bez připojení nelze zjistit, zda fond potvrzení později nenahradil novějším nebo nezrušil.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Ověření proběhlo jen ve vašem zařízení; údaje z kódu se nikam neposílají.'),
    ).toBeVisible();
    expect(verification).toEqual([]);
  });

  test('when no keys are kept yet, then the page cannot verify without a connection, and trying again online verifies the code', async ({
    page,
    context,
  }) => {
    await serveReceiptKeys(page);
    await serveReceiptStatus(page, 'active');
    await page.goto('/overit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');

    await context.setOffline(true);
    await scanAfterLoad(page, SINGLE_RECEIPT);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nelze ověřit bez připojení');

    await context.setOffline(false);
    await page.getByRole('button', { name: 'Zkusit znovu' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);
  });

  test('when the kept keys do not hold the key of the code, then the page cannot verify it yet', async ({
    page,
    context,
  }) => {
    await keepKeyList(page, LIST_WITHOUT_THE_KEY);
    await page.goto('/overit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');

    await context.setOffline(true);
    await scanAfterLoad(page, SINGLE_RECEIPT);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Neověřeno: tento podpis zatím neumíme ověřit',
    );
  });

  test('when the server cannot be reached although the browser is online, then the kept keys still verify the code', async ({
    page,
  }) => {
    await keepKeyList(page);
    await page.route(
      (url) => url.pathname.startsWith('/api/donations/'),
      (route) => route.abort('internetdisconnected'),
    );

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);
    await expect(
      page.getByText(
        'Bez připojení nelze zjistit, zda fond potvrzení později nenahradil novějším nebo nezrušil.',
      ),
    ).toBeVisible();
  });
});
