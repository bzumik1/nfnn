import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, adminSettings, mockDonorApi, session } from './donor-session';
import { noSignature, refusedVector, uploadedSignature, vectorSignature } from './signature-image';

const SETTINGS = '/api/admin/operations/settings';
const SIGNATURE = '/api/admin/donations/receipt-signature';

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

    await card.getByLabel('Nahrát podpis').setInputFiles({
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

  test('when they upload a vector signature, then the card draws it and a refused SVG keeps it with the reason', async ({
    page,
  }) => {
    let current: object = noSignature;
    let uploads = 0;
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === SIGNATURE,
      (route) => {
        if (route.request().method() !== 'POST') {
          return route.fulfill({ json: current });
        }
        uploads++;
        if (uploads === 1) {
          current = vectorSignature;
          return route.fulfill({ json: current });
        }
        return route.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify(refusedVector),
        });
      },
    );

    await page.goto('/sprava/nastaveni');
    const card = page.getByRole('region', { name: 'Podpis na potvrzeních' });
    await expect(card).toContainText('Podpis není nahraný.');

    await card.getByLabel('Nahrát podpis').setInputFiles({
      name: 'podpis.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"/>'),
    });

    const drawing = card.getByRole('img', { name: 'Nahraný podpis' });
    await expect(drawing).toBeVisible();
    await expect(drawing.locator('path')).toHaveCount(2);
    await expect(card).toContainText('Nahráno 23. 10. 2026 21:30, vektorový podpis (SVG).');

    await card.getByLabel('Nahrát jiný podpis').setInputFiles({
      name: 'jiny.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg><script/></svg>'),
    });

    await expect(card.getByRole('alert').filter({ hasText: /\S/ })).toContainText(
      'Soubor obsahuje nepovolený prvek „script“.',
    );
    await expect(drawing.locator('path')).toHaveCount(2);
    expect(uploads).toBe(2);
  });
});
