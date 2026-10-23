import { expect, Page, test } from '@playwright/test';
import { administrator, adminSettings, mockDonorApi, session } from './donor-session';
import { noSignature, uploadedSignature } from './signature-image';

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
    await page.locator('#setting-FIO_TOKEN').fill('new-token');
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();
    await expect(page.getByRole('group', { name: 'Uložit nastavení?' })).toContainText(
      'web restartuje',
    );
    await page.getByRole('button', { name: 'Ano, uložit a restartovat' }).click();

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
    const card = page.getByRole('group', { name: 'Sken podpisu' });
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
    await card.getByRole('button', { name: 'Ano, odebrat' }).click();

    await expect(card.getByRole('status')).toHaveText(
      'Podpis je odebraný. Potvrzení vystavená od teď ho nebudou mít.',
    );
    await expect(card.getByRole('img', { name: 'Nahraný podpis' })).toHaveCount(0);
    expect(methods).toEqual(['GET', 'POST', 'DELETE']);
  });
});
