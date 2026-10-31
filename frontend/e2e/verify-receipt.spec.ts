import { Page, Request } from '@playwright/test';
import { mockDonorApi, openDonorSection, signIn } from './donor-session';
import { expect, test } from './fixtures';
import { fakeCameraShowing, pdfWithLink, pngDataUrl, qrCodePng } from './receipt-code-files';
import {
  CHANGED_AMOUNT,
  serveReceiptApi,
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
const PROOF_ADDRESS = 'https://nfnn.cz/overit#';
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
    expect(status?.postDataJSON()).toEqual({ digest: SINGLE_RECEIPT.statusSha256 });
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
      await expect(page.locator('.ui-status [aria-hidden="true"]')).not.toHaveText('✓');
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
      'Neověřeno: kód podepsal klíč, který fond nezveřejnil',
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
      if (new URL(response.url()).pathname.endsWith('.js')) {
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
      if (new URL(response.url()).pathname.endsWith('.js')) {
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

test.describe('Given a visitor who is online while the fund gives no usable answer', () => {
  const NO_ANSWER = 'Podpis sedí, ale fond teď neodpověděl, zda potvrzení vede';

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when the key list came and the status call is then cut off, then the result is a caution, never green', async ({
    page,
  }) => {
    await serveReceiptApi(page, { keys: KEY_LIST, status: 'reset' });

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NO_ANSWER);
    await expect(page.locator('.ui-status [aria-hidden="true"]')).toHaveText('!');
    await expect(page.getByText('Bez připojení')).toHaveCount(0);
  });

  test('when the key list comes but the page cannot use it, then the code is not verified and the page says whom to write to instead of trying again later', async ({
    page,
  }) => {
    await serveReceiptApi(page, {
      keys: { foundation: { companyIdentifier: '27278794' }, keys: 'none' },
      status: 'active',
    });

    await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Neověřeno: seznam klíčů fondu teď nejde použít',
    );
    await expect(page.getByRole('button', { name: 'Zkusit znovu' })).toHaveCount(0);
    await expect(page.getByText('za chvíli')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'info@nfnn.cz' }).first()).toBeVisible();
  });

  for (const refusal of [503, 429]) {
    test(`when the status call answers ${refusal}, then the signature holds but the result is a caution with a retry, never green`, async ({
      page,
    }) => {
      await serveReceiptApi(page, { keys: KEY_LIST, status: refusal });

      await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(NO_ANSWER);
      await expect(page.locator('.ui-status [aria-hidden="true"]')).toHaveText('!');
      await expect(page.getByRole('button', { name: 'Zkusit znovu' })).toBeVisible();
      await expect(
        page.getByText(
          'Fondu jsme poslali jen otisk podepsaných údajů, abychom zjistili stav potvrzení, ale neodpověděl',
        ),
      ).toBeVisible();
    });

    test(`when the key list answers ${refusal} and keys are kept, then the kept keys check the signature but the result is a caution, not offline`, async ({
      page,
    }) => {
      await keepKeyList(page);
      await serveReceiptApi(page, { keys: refusal, status: 'active' });

      await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(NO_ANSWER);
      await expect(page.getByText('Bez připojení')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Zkusit znovu' })).toBeVisible();
    });

    test(`when the key list answers ${refusal} and no keys are kept, then the page says the check cannot be finished now, not that the visitor is offline`, async ({
      page,
    }) => {
      const api = { keys: refusal as number | object, status: 'active' };
      await serveReceiptApi(page, api);

      await page.goto(`/overit#${SINGLE_RECEIPT.fragment}`);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Ověření teď nejde dokončit',
      );
      await expect(page.getByText('Připojte se k internetu')).toHaveCount(0);

      api.keys = KEY_LIST;
      await page.getByRole('button', { name: 'Zkusit znovu' }).click();

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);
    });
  }
});

test.describe('Given a visitor who opens the verification page without a code', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveReceiptKeys(page);
    await serveReceiptStatus(page, 'active');
  });

  async function expectVerifiedWithoutSendingTheCode(
    page: Page,
    requests: Request[],
  ): Promise<void> {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);
    await expect(page.locator('dd').filter({ hasText: DONOR_NAME })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/overit');
    expect(new URL(page.url()).hash).toBe('');
    for (const request of requests) {
      expect(request.url()).not.toContain(SINGLE_RECEIPT.fragment.slice(0, 17));
      expect(request.postData() ?? '').not.toContain(SINGLE_RECEIPT.fragment.slice(0, 17));
      expect(request.postData() ?? '').not.toContain(DONOR_NAME);
    }
    const api = requests.filter((request) => new URL(request.url()).pathname.startsWith('/api/'));
    expect(
      [
        ...new Set(api.map((request) => `${request.method()} ${new URL(request.url()).pathname}`)),
      ].sort(),
    ).toEqual([
      'GET /api/donations/receipt-keys',
      'GET /api/operations/setup',
      'POST /api/donations/receipts/status',
    ]);
  }

  test('when they paste the link of the code, then the page verifies it in place and sends only the key list request and the digest', async ({
    page,
  }) => {
    const requests: Request[] = [];
    page.on('request', (request) => requests.push(request));
    await page.goto('/overit');

    await page.getByLabel('Odkaz z QR kódu').fill(`${PROOF_ADDRESS}${SINGLE_RECEIPT.fragment}`);
    await page.getByRole('button', { name: 'Ověřit odkaz' }).click();

    await expectVerifiedWithoutSendingTheCode(page, requests);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('when they upload the PDF of the receipt, then the page reads the verification link from it and verifies the code', async ({
    page,
  }) => {
    const requests: Request[] = [];
    page.on('request', (request) => requests.push(request));
    await page.goto('/overit');

    await page.getByLabel('Nahrát PDF nebo fotku').setInputFiles({
      name: 'potvrzeni.pdf',
      mimeType: 'application/pdf',
      buffer: pdfWithLink(`${PROOF_ADDRESS}${SINGLE_RECEIPT.fragment}`),
    });

    await expectVerifiedWithoutSendingTheCode(page, requests);
  });

  test('when they upload a photo of the code, then the page reads the code in the browser and verifies it', async ({
    page,
  }) => {
    const requests: Request[] = [];
    page.on('request', (request) => requests.push(request));
    await page.goto('/overit');

    await page.getByLabel('Nahrát PDF nebo fotku').setInputFiles({
      name: 'kod.png',
      mimeType: 'image/png',
      buffer: qrCodePng(`${PROOF_ADDRESS}${SINGLE_RECEIPT.fragment}`),
    });

    await expectVerifiedWithoutSendingTheCode(page, requests);
  });

  test('when they upload a photo of another QR code, then the page says it is not a receipt code and verifies nothing', async ({
    page,
  }) => {
    await page.goto('/overit');

    await page.getByLabel('Nahrát PDF nebo fotku').setInputFiles({
      name: 'kod.png',
      mimeType: 'image/png',
      buffer: qrCodePng(`https://nfnn.cy/overit#${SINGLE_RECEIPT.fragment.slice(0, 40)}`),
    });

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Tento QR kód nepatří k potvrzení fondu Nová naděje. Načtěte kód z potvrzení o daru.',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');
  });

  test('when they scan the code with the camera in the page, then the page verifies it and turns the camera off', async ({
    page,
  }) => {
    const requests: Request[] = [];
    page.on('request', (request) => requests.push(request));
    await page.addInitScript(
      fakeCameraShowing,
      pngDataUrl(qrCodePng(`${PROOF_ADDRESS}${SINGLE_RECEIPT.fragment}`)),
    );
    await page.goto('/overit');

    await page.getByRole('button', { name: 'Naskenovat QR kód' }).click();

    await expectVerifiedWithoutSendingTheCode(page, requests);
    await expect(page.locator('video')).toHaveCount(0);
  });

  test('when the browser refuses the camera, then the page says how to go on', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
        },
      });
    });
    await page.goto('/overit');

    await page.getByRole('button', { name: 'Naskenovat QR kód' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Prohlížeč nedovolil použít fotoaparát. Povolte ho v nastavení prohlížeče, nebo nahrajte PDF či fotku kódu.',
    );
  });

  test('when a result is shown, then another receipt can be verified from the same page', async ({
    page,
  }) => {
    await page.goto('/overit');
    await page.getByLabel('Odkaz z QR kódu').fill(`${PROOF_ADDRESS}${SINGLE_RECEIPT.fragment}`);
    await page.getByRole('button', { name: 'Ověřit odkaz' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SIGNED);

    await page.getByRole('button', { name: 'Ověřit další potvrzení' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByLabel('Odkaz z QR kódu')).toHaveValue('');
  });
});

test.describe('Given a signed-in donor on the receipts page', () => {
  test('when they choose to verify a receipt, then the verification page opens ready to read a code', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await serveReceiptKeys(page);
    await signIn(page);
    await openDonorSection(page, 'Potvrzení o daru');

    await page.getByRole('link', { name: 'Ověřit potvrzení' }).click();

    await expect(page).toHaveURL(/\/overit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');
    await expect(page.getByRole('button', { name: 'Naskenovat QR kód' })).toBeVisible();
  });
});
