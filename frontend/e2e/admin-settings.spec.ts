import { expect, Page, test } from '@playwright/test';
import { administrator, adminSettings, mockDonorApi, session } from './donor-session';

const SETTINGS = '/api/admin/operations/settings';

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

    await expect(page.locator('.admin-notice--status')).toHaveText(
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
});
