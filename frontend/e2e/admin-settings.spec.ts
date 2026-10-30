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

  test('when they upload a vector signature, then the card draws it, a refused SVG keeps it with the reason first, and a scan and an SVG replace each other', async ({
    page,
  }) => {
    let current: object = noSignature;
    let uploads = 0;
    const answers: object[] = [vectorSignature, refusedVector, uploadedSignature, vectorSignature];
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
        const answer = answers[uploads++];
        if (answer === refusedVector) {
          return route.fulfill({
            status: 400,
            contentType: 'application/problem+json',
            body: JSON.stringify(refusedVector),
          });
        }
        current = answer;
        return route.fulfill({ json: current });
      },
    );

    await page.goto('/sprava/nastaveni');
    const card = page.getByRole('region', { name: 'Podpis na potvrzeních' });
    const saved = card.getByRole('status').filter({ hasText: /\S/ });
    const alert = card.getByRole('alert').filter({ hasText: /\S/ });
    await expect(card).toContainText('Podpis není nahraný.');

    await card.getByLabel('Nahrát podpis').setInputFiles({
      name: 'podpis.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"/>'),
    });

    const drawing = card.locator('svg.signature-preview');
    await expect(drawing).toBeVisible();
    await expect(drawing).toHaveAccessibleName('Nahraný podpis');
    await expect(drawing.locator('path')).toHaveCount(2);
    await expect(card).toContainText('Nahráno 23. 10. 2026 21:30, vektorový podpis (SVG).');
    await expect(saved).toHaveText('Podpis je uložený. Ponesou ho potvrzení vystavená od teď.');

    await card.getByLabel('Nahrát jiný podpis').setInputFiles({
      name: 'jiny.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg><script/></svg>'),
    });

    await expect(alert).toHaveText(
      'SVG nejde použít jako podpis. Soubor obsahuje nepovolený prvek „script“. Ručně psaný podpis v SVG jde, když jsou jeho tahy převedené na vyplněné tvary (path); obrysy s nastavenou tloušťkou čáry (stroke) a efekty web nepřijme a soubor smí mít nejvýš 200 kB. Místo něj můžete nahrát sken JPEG, PNG nebo WebP.',
    );
    await expect(drawing.locator('path')).toHaveCount(2);

    await card.getByLabel('Nahrát jiný podpis').setInputFiles({
      name: 'podpis.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    });

    const scan = card.locator('img.signature-preview');
    await expect(scan).toBeVisible();
    await expect(drawing).toHaveCount(0);
    await expect(card).toContainText('Nahráno 23. 10. 2026 21:30, 600 × 200 px.');
    await expect(saved).toHaveText('Podpis je uložený. Ponesou ho potvrzení vystavená od teď.');
    await expect(alert).toHaveCount(0);

    await card.getByLabel('Nahrát jiný podpis').setInputFiles({
      name: 'podpis.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"/>'),
    });

    await expect(drawing.locator('path')).toHaveCount(2);
    await expect(scan).toHaveCount(0);
    await expect(card).toContainText('Nahráno 23. 10. 2026 21:30, vektorový podpis (SVG).');
    expect(uploads).toBe(4);
  });

  test('when the vector signature is shown in a dark forced-colours mode, then its frame keeps the paper and the ink keeps its colour', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === SIGNATURE,
      (route) => route.fulfill({ json: vectorSignature }),
    );

    await page.goto('/sprava/nastaveni');
    const card = page.getByRole('region', { name: 'Podpis na potvrzeních' });
    const frame = card.locator('.signature-frame');
    await expect(frame.locator('path')).toHaveCount(2);

    const colours = await frame.evaluate((element) => ({
      adjust: getComputedStyle(element).forcedColorAdjust,
      paper: getComputedStyle(element).backgroundColor,
      ink: getComputedStyle(element.querySelector('path') as Element).fill,
    }));
    expect(colours.adjust).toBe('none');
    expect(colours.paper).not.toBe('rgb(0, 0, 0)');
    expect(colours.ink).toBe('rgb(29, 42, 92)');
  });
});
