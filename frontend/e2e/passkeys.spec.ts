import { expect, Page, test } from '@playwright/test';
import {
  CHALLENGE,
  donor,
  mockDonorApi,
  openDonorSection,
  openSignInDialog,
  problem,
  session,
  signIn,
} from './donor-session';

type DeviceAnswer = 'confirm' | 'dismiss';

async function deviceThatWill(page: Page, answer: DeviceAnswer): Promise<void> {
  await page.addInitScript((answer: DeviceAnswer) => {
    const bytes = (text: string) => new TextEncoder().encode(text).buffer;
    const ceremony = (response: Record<string, unknown>) =>
      answer === 'dismiss'
        ? Promise.reject(new DOMException('Dismissed', 'NotAllowedError'))
        : Promise.resolve({ id: 'a2V5', rawId: bytes('key'), type: 'public-key', response });
    Object.defineProperty(navigator.credentials, 'create', {
      value: () =>
        ceremony({
          clientDataJSON: bytes('client'),
          attestationObject: bytes('attestation'),
          getTransports: () => ['internal', 'hybrid'],
        }),
    });
    Object.defineProperty(navigator.credentials, 'get', {
      value: () =>
        ceremony({
          clientDataJSON: bytes('client'),
          authenticatorData: bytes('authenticator'),
          signature: bytes('signature'),
          userHandle: bytes('user'),
        }),
    });
  }, answer);
}

const signInOptions = {
  challenge: CHALLENGE,
  rpId: 'localhost',
  timeout: 300000,
  userVerification: 'required',
  allowCredentials: [],
};

const creationOptions = {
  challenge: CHALLENGE,
  rp: { id: 'localhost', name: 'Nová naděje' },
  user: { id: 'AaGOVr2wd1q9CqYHVoMTaQ', name: 'jana@example.cz', displayName: 'Jana Nováková' },
  pubKeyCredParams: [
    { type: 'public-key', alg: -7 },
    { type: 'public-key', alg: -8 },
    { type: 'public-key', alg: -257 },
  ],
  timeout: 300000,
  excludeCredentials: [],
  authenticatorSelection: {
    residentKey: 'required',
    requireResidentKey: true,
    userVerification: 'required',
  },
  attestation: 'none',
};

test.describe('Given a donor with a passkey', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/passkey/options', (route) =>
      route.fulfill({ json: signInOptions }),
    );
  });

  test('when they choose the passkey in the sign-in dialog, then the device answers and they are signed in without the password', async ({
    page,
  }) => {
    await deviceThatWill(page, 'confirm');
    const answers: unknown[] = [];
    await page.route('**/api/donors/auth/passkey', async (route) => {
      answers.push(route.request().postDataJSON());
      await route.fulfill(session(200, donor));
    });

    await openSignInDialog(page);
    await page.getByRole('button', { name: 'Přihlásit se přístupovým klíčem' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.nav-login', { hasText: 'Můj přehled' })).toBeVisible();
    expect(answers).toEqual([
      {
        challenge: CHALLENGE,
        credential: {
          id: 'a2V5',
          rawId: 'a2V5',
          type: 'public-key',
          response: {
            clientDataJSON: 'Y2xpZW50',
            authenticatorData: 'YXV0aGVudGljYXRvcg',
            signature: 'c2lnbmF0dXJl',
            userHandle: 'dXNlcg',
          },
        },
      },
    ]);
  });

  test('when they dismiss the prompt of the device, then the dialog says so and the password still works', async ({
    page,
  }) => {
    await deviceThatWill(page, 'dismiss');

    await openSignInDialog(page);
    await page.getByRole('button', { name: 'Přihlásit se přístupovým klíčem' }).click();

    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      'Přihlášení přístupovým klíčem neproběhlo',
    );
    await expect(page.locator('#login-email')).toBeEnabled();
  });

  test('when the site does not know the passkey, then the dialog shows the reason from the server', async ({
    page,
  }) => {
    await deviceThatWill(page, 'confirm');
    await page.route('**/api/donors/auth/passkey', (route) =>
      route.fulfill(
        problem(
          401,
          'auth/invalid-passkey',
          'Přístupový klíč neznáme',
          'Přihlaste se prosím e-mailem a heslem, nebo to zkuste znovu.',
        ),
      ),
    );

    await openSignInDialog(page);
    await page.getByRole('button', { name: 'Přihlásit se přístupovým klíčem' }).click();

    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      'Přístupový klíč neznáme',
    );
  });
});

test.describe('Given a signed-in donor in the account details', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they add a passkey with the password and the device confirms it, then the card lists it', async ({
    page,
  }) => {
    await deviceThatWill(page, 'confirm');
    const requests: unknown[] = [];
    await page.route('**/api/donors/me/passkeys/options', async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: creationOptions });
    });
    await page.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.fallback();
          return;
        }
        requests.push(route.request().postDataJSON());
        await route.fulfill({
          status: 201,
          json: {
            id: '019a1b2c-3d4e-7f00-8000-000000000001',
            name: 'Pracovní notebook',
            createdAt: '2026-10-23T10:00:00Z',
            lastUsedAt: null,
          },
        });
      },
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const card = page.getByRole('region', { name: 'Přístupové klíče' });
    await expect(card).toContainText('Zatím nemáte žádný přístupový klíč');
    await card.getByRole('button', { name: 'Přidat přístupový klíč' }).click();
    await expect(card.getByLabel('Název klíče')).toBeFocused();
    await card.getByLabel('Název klíče').fill('Pracovní notebook');
    await card.getByLabel('Současné heslo').fill('correct horse battery');
    await card.getByRole('button', { name: 'Vytvořit klíč' }).click();

    await expect(card.getByRole('status')).toContainText(
      'Přístupový klíč Pracovní notebook je přidaný',
    );
    await expect(card.locator('.passkey-name')).toHaveText(['Pracovní notebook']);
    await expect(card.getByRole('button', { name: 'Přidat přístupový klíč' })).toBeFocused();
    expect(requests).toEqual([
      { password: 'correct horse battery' },
      {
        challenge: CHALLENGE,
        name: 'Pracovní notebook',
        credential: {
          id: 'a2V5',
          rawId: 'a2V5',
          type: 'public-key',
          response: {
            clientDataJSON: 'Y2xpZW50',
            attestationObject: 'YXR0ZXN0YXRpb24',
            transports: ['internal', 'hybrid'],
          },
        },
      },
    ]);
  });

  test('when they rename a passkey, then the card shows the new name', async ({ page }) => {
    const iphone = {
      id: '019a1b2c-3d4e-7f00-8000-000000000001',
      name: 'iPhone',
      createdAt: '2026-10-23T10:00:00Z',
      lastUsedAt: null,
    };
    const renames: unknown[] = [];
    await page.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      (route) => route.fulfill({ json: { items: [iphone] } }),
    );
    await page.route(`**/api/donors/me/passkeys/${iphone.id}`, async (route) => {
      renames.push({ method: route.request().method(), body: route.request().postDataJSON() });
      await route.fulfill({ json: { ...iphone, name: 'iPhone 16 Pro Max' } });
    });
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const card = page.getByRole('region', { name: 'Přístupové klíče' });
    await card.getByRole('button', { name: 'Přejmenovat' }).click();
    const field = card.getByLabel('Nový název klíče');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('iPhone');
    await field.fill('iPhone 16 Pro Max');
    await card.getByRole('button', { name: 'Uložit název' }).click();

    await expect(card.getByRole('status')).toContainText(
      'Přístupový klíč je přejmenovaný na iPhone 16 Pro Max.',
    );
    await expect(card.locator('.passkey-name')).toHaveText(['iPhone 16 Pro Max']);
    await expect(card.getByRole('button', { name: 'Přejmenovat' })).toBeFocused();
    expect(renames).toEqual([{ method: 'PATCH', body: { name: 'iPhone 16 Pro Max' } }]);
  });
});

const passwordless = { ...donor, hasPassword: false };

test.describe('Given a visitor who wants an account without a password', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they register with a passkey, then no password is asked for or sent', async ({
    page,
  }) => {
    let registration: Record<string, unknown> = {};
    await page.route('**/api/donors/auth/register', async (route) => {
      registration = route.request().postDataJSON();
      await route.fulfill({ status: 202, body: '' });
    });
    await openSignInDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Registrace' }).click();
    await dialog.getByLabel('Jméno a příjmení').fill('Jana Nováková');
    await dialog.getByLabel('Ulice a číslo').fill('Dlouhá 12');
    await dialog.getByLabel('Město').fill('Ústí nad Labem');
    await dialog.getByLabel('PSČ').fill('400 01');
    await dialog.getByLabel('E-mail').fill('jana@example.cz');
    await dialog.getByRole('radio', { name: 'Přístupovým klíčem' }).click();

    await expect(dialog.getByLabel('Heslo', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Registrovat' }).click();

    await expect(dialog.getByRole('heading', { name: 'Zkontrolujte si e-mail' })).toBeVisible();
    expect(registration['password']).toBeNull();
  });

  test('when they open the confirmation link, then they create the first passkey and the account details say the account has no password', async ({
    page,
  }) => {
    await deviceThatWill(page, 'confirm');
    const requests: unknown[] = [];
    await page.route('**/api/donors/auth/email-verification/confirm', (route) =>
      route.fulfill(session(200, passwordless)),
    );
    await page.route('**/api/donors/me/passkeys/options', async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: creationOptions });
    });
    await page.route(
      (url) => url.pathname === '/api/donors/me/passkeys',
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 201,
          json: {
            id: '019a1b2c-3d4e-7f00-8000-000000000001',
            name: 'Linux',
            createdAt: '2026-10-23T10:00:00Z',
            lastUsedAt: null,
          },
        });
      },
    );

    await page.goto('/potvrzeni-emailu#token=abc');
    await page.getByRole('button', { name: 'Vytvořit přístupový klíč' }).click();

    await expect(page.getByRole('status')).toContainText('Přístupový klíč je uložený');
    expect(requests).toEqual([{}]);
    await page.getByRole('button', { name: 'Přejít do přehledu' }).click();
    await openDonorSection(page, 'Údaje a zabezpečení');
    const account = page.getByRole('region', { name: 'Přihlašovací údaje' });
    await expect(account).toContainText('Bez hesla, jen přístupové klíče');
    await expect(account.getByRole('button', { name: 'Nastavit heslo' })).toBeVisible();
  });

  test('when they lost every passkey, then the reset link with the code from the app adds a new one', async ({
    page,
  }) => {
    await deviceThatWill(page, 'confirm');
    const options: unknown[] = [];
    await page.route('**/api/donors/auth/password-reset/passkey/options', async (route) => {
      const body = route.request().postDataJSON();
      options.push(body);
      await route.fulfill(
        body.code === undefined
          ? problem(
              400,
              'donors/second-factor-code-required',
              'Zadejte kód z aplikace',
              'Účet má zapnuté dvoufaktorové ověření.',
            )
          : { json: creationOptions },
      );
    });
    await page.route('**/api/donors/auth/password-reset/passkey', (route) =>
      route.fulfill({
        status: 201,
        json: {
          id: '019a1b2c-3d4e-7f00-8000-000000000002',
          name: 'Nový telefon',
          createdAt: '2026-10-23T10:00:00Z',
          lastUsedAt: null,
        },
      }),
    );

    await page.goto('/obnova-hesla#token=abc');
    await page.getByRole('radio', { name: 'Nový přístupový klíč' }).click();
    await page.getByLabel('Název klíče').fill('Nový telefon');
    await page.getByRole('button', { name: 'Vytvořit klíč' }).click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    await page.getByLabel('Kód z aplikace').fill('287082');
    await page.getByRole('button', { name: 'Vytvořit klíč' }).click();

    await expect(page.getByRole('heading', { name: 'Přístupový klíč je uložený' })).toBeVisible();
    expect(options).toEqual([{ token: 'abc' }, { token: 'abc', code: '287082' }]);
  });
});
