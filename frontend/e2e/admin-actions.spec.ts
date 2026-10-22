import { expect, Page, test } from '@playwright/test';
import { administrator, mockDonorApi, session } from './donor-session';

const ACTIONS = '/api/admin/donors/actions';

function action(overrides: Record<string, unknown>) {
  return {
    id: '019a1c00-0000-7000-8000-00000000e001',
    adminId: administrator.id,
    adminName: 'Jana Nováková',
    adminEmail: 'jana@example.cz',
    action: 'PAIR_PAYMENT',
    subjectId: '019a1c00-0000-7000-8000-000000001001',
    details: 'Bank payment 019a1c00-0000-7000-8000-000000001001 paired to donor by hand',
    performedAt: '2026-10-22T10:00:00Z',
    ...overrides,
  };
}

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator on the history page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they open the history and load the older page, then the changes come newest first with names and the next page appends', async ({
    page,
  }) => {
    const requests: string[] = [];
    await page.route(
      (url) => url.pathname === ACTIONS,
      (route) => {
        const url = new URL(route.request().url());
        requests.push(url.search);
        if (url.searchParams.has('before')) {
          return route.fulfill({
            json: {
              items: [
                action({
                  id: '019a1c00-0000-7000-8000-00000000e003',
                  adminId: '019a1c00-0000-7000-8000-00000000a009',
                  adminName: null,
                  adminEmail: null,
                  action: 'REVOKE_ADMINISTRATION',
                  details: 'Donor 019a1c00-0000-7000-8000-00000000a002 lost the ADMIN role',
                  performedAt: '2026-10-20T08:00:00Z',
                }),
              ],
              hasMore: false,
            },
          });
        }
        return route.fulfill({
          json: {
            items: [
              action({}),
              action({
                id: '019a1c00-0000-7000-8000-00000000e002',
                action: 'GRANT_ADMINISTRATION',
                details: 'Donor 019a1c00-0000-7000-8000-00000000a002 granted the ADMIN role',
                performedAt: '2026-10-21T15:20:00Z',
              }),
            ],
            hasMore: true,
          },
        });
      },
    );

    await page.goto('/sprava/historie');

    await expect(page).toHaveTitle('Historie správy | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Historie správy' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.locator('tbody tr').first()).toContainText('22. 10. 2026 12:00');
    await expect(page.locator('tbody tr').first()).toContainText('Jana Nováková');
    await expect(page.locator('tbody tr').first()).toContainText('Přiřazení platby dárci');
    await expect(page.locator('tbody tr').nth(1)).toContainText('Přidání správce');

    await page.getByRole('button', { name: 'Načíst starší' }).click();

    await expect(page.locator('tbody tr')).toHaveCount(3);
    await expect(page.locator('tbody tr').nth(2)).toContainText('správce bez účtu');
    await expect(page.locator('tbody tr').nth(2)).toContainText('Odebrání správce');
    await expect(page.getByRole('button', { name: 'Načíst starší' })).toHaveCount(0);
    expect(requests).toEqual(['?limit=50', '?limit=50&before=2026-10-21T15:20:00Z']);
  });

  test('when nothing was changed yet, then the page says so', async ({ page }) => {
    await page.route(
      (url) => url.pathname === ACTIONS,
      (route) => route.fulfill({ json: { items: [], hasMore: false } }),
    );

    await page.goto('/sprava/historie');

    await expect(page.getByText('Zatím žádný správce nic nezměnil.')).toBeVisible();
  });
});
