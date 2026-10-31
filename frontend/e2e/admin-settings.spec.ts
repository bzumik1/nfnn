import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  administrator,
  adminSettings,
  mockDonorApi,
  receiptSigningKeys,
  session,
} from './donor-session';
import { noSignature, uploadedSignature } from './signature-image';

const SETTINGS = '/api/admin/operations/settings';
const SIGNATURE = '/api/admin/donations/receipt-signature';
const SIGNING_KEYS = '/api/admin/donations/receipt-signing-keys';

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator on the settings page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they change a value and a secret and confirm, then only the changes are sent and the page waits for the restart', async ({
    page,
  }) => {
    const saved: unknown[] = [];
    let restarted = false;
    await page.route(
      (url) => url.pathname === '/api/operations/setup',
      (route) => {
        if (saved.length > 0 && !restarted) {
          restarted = true;
          return route.fulfill({ status: 502, body: '' });
        }
        return route.fulfill({ json: { required: false, codeRequired: true } });
      },
    );
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => {
        if (route.request().method() === 'PUT') {
          saved.push(route.request().postDataJSON());
          return route.fulfill({
            status: 202,
            json: { changed: ['RECEIPT_FIRST_YEAR', 'FIO_TOKEN'], restarting: true },
          });
        }
        return route.fulfill({ json: adminSettings });
      },
    );

    await page.goto('/sprava/nastaveni');
    await expect(page.getByRole('heading', { level: 1, name: 'Nastavení' })).toBeFocused();
    await expect(page.locator('.secret-state').first()).toHaveText(
      'Heslo nebo klíč SMTP: Nastaveno',
    );

    await page.locator('#setting-RECEIPT_FIRST_YEAR').fill('2025');
    await page.getByText('Adresa webu, server pro odesílání e-mailů a napojení na banku').click();
    await page.locator('#setting-FIO_TOKEN').fill('new-token');
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();
    await expect(page.getByRole('group', { name: 'Uložit nastavení?' })).toContainText(
      'web restartuje',
    );
    await page.getByRole('button', { name: 'Uložit a restartovat' }).click();

    await expect(page.locator('.ui-notice--status')).toHaveText(
      'Nastavení je uložené a web po restartu běží s ním.',
      { timeout: 15_000 },
    );
    expect(saved).toEqual([
      {
        changes: [
          { name: 'FIO_TOKEN', value: 'new-token' },
          { name: 'RECEIPT_FIRST_YEAR', value: '2025' },
        ],
      },
    ]);
  });

  test('when they try a new sender with a test e-mail before saving, then it goes to their own address and the confirmation lists the change without a warning', async ({
    page,
  }) => {
    const tested: unknown[] = [];
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === `${SETTINGS}/test-email`,
      (route) => {
        tested.push(route.request().postDataJSON());
        return route.fulfill({
          json: { outcome: 'SENT', sent: true, recipient: administrator.email },
        });
      },
    );

    await page.goto('/sprava/nastaveni');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Potvrzení o daru',
      'Podpis na potvrzeních',
      'Klíč k ověřovacím QR kódům',
      'Kontaktní formulář',
      'Odesílatel e-mailů',
      'Technické nastavení (pro správce serveru)',
    ]);
    await expect(page.locator('#setting-MAIL_HOST')).toBeHidden();

    await page.locator('#setting-MAIL_FROM').fill('novy@nfnn.cz');
    await page.getByText('Adresa webu, server pro odesílání e-mailů a napojení na banku').click();
    await page.getByRole('button', { name: 'Poslat zkušební e-mail na moji adresu' }).click();
    await expect(page.locator('.test-row').getByRole('status')).toHaveText(
      `Zkušební e-mail odešel na ${administrator.email}. Podívejte se prosím do schránky, i do nevyžádané pošty. Když do pár minut nedorazí, zkontrolujte adresu odesílatele a ověření její domény v Brevo.`,
    );
    expect(tested).toEqual([
      {
        host: 'smtp-relay.brevo.com',
        port: 587,
        username: 'abc@smtp-brevo.com',
        password: '',
        auth: true,
        startTls: true,
        sender: 'novy@nfnn.cz',
      },
    ]);

    await page.getByRole('button', { name: 'Uložit nastavení' }).click();
    const confirmation = page.getByRole('group', { name: 'Uložit nastavení?' });
    await expect(confirmation).toContainText('Mění se: Odesílatel e-mailů.');
    await expect(confirmation.locator('.ui-callout--warning')).toHaveCount(0);
  });

  test('when they follow the link to the mail settings from another page, then the technical settings open at the mail server', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );

    await page.goto('/sprava/nastaveni#settings-MAIL');

    await expect(
      page.getByRole('heading', { level: 3, name: 'Server pro odesílání e-mailů' }),
    ).toBeFocused();
    await expect(page.locator('#setting-MAIL_HOST')).toBeVisible();
  });

  test('when they upload a scan of the signature and remove it again, then the receipts card shows it and asks before removing', async ({
    page,
  }) => {
    let current: object = noSignature;
    const methods: string[] = [];
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === SIGNATURE,
      (route) => {
        const method = route.request().method();
        methods.push(method);
        if (method === 'POST') {
          current = uploadedSignature;
        }
        if (method === 'DELETE') {
          current = noSignature;
          return route.fulfill({ status: 204, body: '' });
        }
        return route.fulfill({ json: current });
      },
    );

    await page.goto('/sprava/nastaveni');
    const card = page.getByRole('region', { name: 'Podpis na potvrzeních' });
    await expect(card).toContainText('Podpis není nahraný.');

    await card.getByLabel('Nahrát sken').setInputFiles({
      name: 'podpis.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('JPEG'),
    });

    await expect(card.getByRole('img', { name: 'Nahraný podpis' })).toBeVisible();
    await expect(card.getByRole('status')).toHaveText(
      'Podpis je uložený. Ponesou ho potvrzení vystavená od teď.',
    );
    await expect(card).toContainText('Nahráno 23. 10. 2026 21:30, 600 × 200 px.');

    await card.getByRole('button', { name: 'Odebrat podpis' }).click();
    await expect(card.getByRole('group', { name: 'Odebrat podpis?' })).toContainText('bez podpisu');
    await card
      .getByRole('group', { name: 'Odebrat podpis?' })
      .getByRole('button', { name: 'Odebrat podpis' })
      .click();

    await expect(card.getByRole('status')).toHaveText(
      'Podpis je odebraný. Potvrzení vystavená od teď ho nebudou mít.',
    );
    await expect(card.getByRole('img', { name: 'Nahraný podpis' })).toHaveCount(0);
    expect(methods).toEqual(['GET', 'POST', 'DELETE']);
  });
});

test.describe('Given an administrator whose receipt signing key may have leaked', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
  });

  test('when they withdraw the key of the server with a fresh code, then the key shows as withdrawn, the web goes down and comes back and the card shows the new key', async ({
    page,
  }) => {
    const withdrawals: unknown[] = [];
    let restarted = false;
    const newKey = {
      ...receiptSigningKeys.keys[0],
      keyId: 'b7e1c2d4',
      registeredAt: '2026-11-20T09:31:00Z',
    };
    await page.route(
      (url) => url.pathname === SIGNING_KEYS,
      (route) => {
        if (withdrawals.length > 0 && !restarted) {
          restarted = true;
          return route.fulfill({ status: 502, body: '' });
        }
        return route.fulfill({
          json: restarted
            ? {
                ...receiptSigningKeys,
                currentKeyId: 'b7e1c2d4',
                keys: [
                  { ...receiptSigningKeys.keys[0], status: 'revoked', current: false },
                  newKey,
                ],
              }
            : receiptSigningKeys,
        });
      },
    );
    await page.route(
      (url) => url.pathname === `${SIGNING_KEYS}/21fe31df/withdrawal`,
      (route) => {
        withdrawals.push(route.request().postDataJSON());
        return route.fulfill({
          json: {
            ...receiptSigningKeys,
            keys: receiptSigningKeys.keys.map((key) => ({ ...key, status: 'revoked' })),
            restarting: true,
          },
        });
      },
    );

    await page.goto('/sprava/nastaveni');
    const card = page.getByRole('region', { name: 'Klíč k ověřovacím QR kódům' });
    await card.getByRole('button', { name: 'Stáhnout klíč serveru…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Stáhnout klíč 21fe31df?' });
    await expect(dialog).toContainText('Web se hned restartuje');
    await expect(dialog.getByLabel('Kód z aplikace')).toBeFocused();
    await dialog.getByLabel('Kód z aplikace').fill('123456');
    await dialog.getByRole('button', { name: 'Stáhnout klíč', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(card.locator('dd')).toHaveText(['21fe31df', '13. 11. 2026 12:00', 'Stažený']);
    await expect(card.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Klíč 21fe31df je stažený. Web se restartuje a vytvoří si nový klíč, obvykle do minuty.',
    );
    await expect(card.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Klíč 21fe31df je stažený a web po restartu podepisuje novým klíčem.',
      { timeout: 15_000 },
    );
    await expect(card.locator('dd').first()).toHaveText('b7e1c2d4');
    expect(withdrawals).toEqual([{ secondFactorCode: '123456' }]);
  });

  test('when they cancel the withdrawal, then nothing is sent and focus returns to the button', async ({
    page,
  }) => {
    let sent = false;
    await page.route(
      (url) => url.pathname === `${SIGNING_KEYS}/21fe31df/withdrawal`,
      (route) => {
        sent = true;
        return route.fulfill({ status: 500, body: '' });
      },
    );

    await page.goto('/sprava/nastaveni');
    const opener = page.getByRole('button', { name: 'Stáhnout klíč serveru…' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Stáhnout klíč 21fe31df?' });
    await expect(dialog.getByLabel('Kód z aplikace')).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(sent).toBe(false);
  });
});
