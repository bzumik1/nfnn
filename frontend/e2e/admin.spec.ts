import { expect, Page, test } from '@playwright/test';
import { administrator, donor, mockDonorApi, problem, session, signIn } from './donor-session';

const IMPORT_STATE = '/api/admin/donations/import-state';
const OVERVIEW = '/api/admin/donations/overview';
const BACKUPS = '/api/admin/operations/backups';

const backups = {
  available: true,
  backups: [],
  lastBackup: {
    outcome: 'OK',
    startedAt: '2026-10-23T01:00:00Z',
    finishedAt: '2026-10-23T01:00:03Z',
    fileName: 'nfnn-2026-10-23_0300.dump',
    sizeBytes: 1590,
    tables: null,
    requestId: null,
    error: null,
  },
  lastTestRestore: null,
  lastRestore: null,
  restoreFiles: [],
  pendingRequests: 0,
  problems: ['TEST_RESTORE_MISSING'],
};

const overview = {
  year: 2026,
  availableYears: [2026, 2025],
  donorsRegistered: 3,
  newDonors: 3,
  received: { count: 5, totalMinor: 288350, currency: 'CZK' },
  paired: { count: 4, totalMinor: 273350, currency: 'CZK' },
  unpaired: { count: 1, totalMinor: 15000, currency: 'CZK' },
  months: [
    {
      month: '2026-10',
      received: { count: 1, totalMinor: 99900, currency: 'CZK' },
      newDonors: 1,
      paired: { count: 1, totalMinor: 99900, currency: 'CZK' },
      unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
    },
    {
      month: '2026-09',
      received: { count: 3, totalMinor: 168450, currency: 'CZK' },
      newDonors: 1,
      paired: { count: 2, totalMinor: 153450, currency: 'CZK' },
      unpaired: { count: 1, totalMinor: 15000, currency: 'CZK' },
    },
    {
      month: '2026-08',
      received: { count: 1, totalMinor: 20000, currency: 'CZK' },
      newDonors: 1,
      paired: { count: 1, totalMinor: 20000, currency: 'CZK' },
      unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
    },
  ],
};

async function mockOverview(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === OVERVIEW,
    (route) => {
      const year = new URL(route.request().url()).searchParams.get('year');
      return route.fulfill({
        json:
          year === '2025'
            ? {
                ...overview,
                year: 2025,
                newDonors: 0,
                received: { count: 1, totalMinor: 50000, currency: 'CZK' },
                paired: { count: 1, totalMinor: 50000, currency: 'CZK' },
                unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
                months: [
                  {
                    month: '2025-12',
                    received: { count: 1, totalMinor: 50000, currency: 'CZK' },
                    newDonors: 0,
                    paired: { count: 1, totalMinor: 50000, currency: 'CZK' },
                    unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
                  },
                ],
              }
            : overview,
      });
    },
  );
}

async function mockBackups(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === BACKUPS,
    (route) => route.fulfill({ json: backups }),
  );
}

async function mockImportState(page: Page, state: Record<string, unknown>): Promise<void> {
  await page.route(
    (url) => url.pathname === IMPORT_STATE,
    (route) => route.fulfill({ json: state }),
  );
}

async function rememberedSession(page: Page, user: typeof donor): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200, user)));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

function value(page: Page, label: string) {
  return page
    .getByRole('region', { name: 'Stav stahování plateb z banky' })
    .locator('.admin-data > div', { hasText: label })
    .locator('dd');
}

const quietImport = {
  coveredFrom: null,
  coveredTo: null,
  lastAttemptedAt: null,
  lastSucceededAt: null,
  lastFailure: null,
  consecutiveFailures: 0,
  reportedOutage: null,
};

test.describe('Given an administrator', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await mockOverview(page);
    await mockBackups(page);
  });

  test('when they sign in, then the overview offers the administration and it shows how the bank import is doing', async ({
    page,
  }) => {
    const authorization: (string | undefined)[] = [];
    await page.route(
      (url) => url.pathname === IMPORT_STATE,
      (route) => {
        authorization.push(route.request().headers()['authorization']);
        return route.fulfill({
          json: {
            coveredFrom: '2026-07-20',
            coveredTo: '2026-10-17',
            lastAttemptedAt: '2026-10-18T08:05:30Z',
            lastSucceededAt: '2026-10-18T08:05:30Z',
            lastFailure: null,
            consecutiveFailures: 0,
            reportedOutage: null,
          },
        });
      },
    );
    await signIn(page, administrator);

    await page.getByRole('link', { name: 'Správa' }).click();

    await expect(page).toHaveURL(/\/sprava$/);
    await expect(page).toHaveTitle('Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeFocused();
    await expect(value(page, 'Stažené období')).toHaveText('20. 07. 2026 – 17. 10. 2026');
    await expect(value(page, 'Poslední úspěšné stažení')).toHaveText('18. 10. 2026 10:05');
    await expect(value(page, 'Poslední chyba')).toHaveText('žádná');
    await expect(page.locator('.admin-outage')).toHaveCount(0);
    expect(authorization).toEqual(['Bearer token-1']);
    const backupsCard = page.getByRole('region', { name: 'Zálohy databáze' });
    await expect(backupsCard).toContainText(
      'Zkušební obnova ještě neproběhla, i když zálohy jsou starší než týden.',
    );
    await expect(backupsCard).toContainText('23. 10. 2026 03:00 (2 kB)');
    await expect(backupsCard.getByRole('link', { name: 'Otevřít zálohy' })).toHaveAttribute(
      'href',
      '/sprava/zalohy',
    );
    await expect(
      page.getByText('Registrovaní dárci: 3, z toho nových v roce 2026: 3.'),
    ).toBeVisible();
    await expect(page.locator('.overview-table tbody tr')).toHaveText([
      'říjen 2026 1 1 999 Kč 999 Kč 0 Kč',
      'září 2026 3 1 1 684,50 Kč 1 534,50 Kč 150 Kč',
      'srpen 2026 1 1 200 Kč 200 Kč 0 Kč',
    ]);
    await expect(page.locator('.overview-table tfoot tr')).toHaveText(
      'Celkem 2026 5 3 2 883,50 Kč 2 733,50 Kč 150 Kč',
    );

    await page.getByLabel('Rok').selectOption('2025');

    await expect(
      page.getByText('Registrovaní dárci: 3, z toho nových v roce 2025: 0.'),
    ).toBeVisible();
    await expect(page.locator('.overview-table tbody tr')).toHaveText([
      'prosinec 2025 1 0 500 Kč 500 Kč 0 Kč',
    ]);

    await page.getByRole('link', { name: 'Můj přehled', exact: true }).click();

    await expect(page).toHaveURL(/\/darce\/prehled$/);
  });

  test('when the bank import keeps failing, then the administration says so and names the failure', async ({
    page,
  }) => {
    await mockImportState(page, {
      coveredFrom: '2026-07-20',
      coveredTo: '2026-10-17',
      lastAttemptedAt: '2026-10-18T09:00:00Z',
      lastSucceededAt: '2026-10-17T10:00:00Z',
      lastFailure: {
        kind: 'UNAUTHORIZED',
        message: 'HTTP 401',
        attemptedAt: '2026-10-18T09:00:00Z',
      },
      consecutiveFailures: 1,
      reportedOutage: 'UNAUTHORIZED',
    });
    await rememberedSession(page, administrator);

    await page.goto('/sprava');

    await expect(page.locator('.admin-outage')).toContainText(
      'Stahování plateb selhává a fond o tom dostal e-mail: Fio odmítlo token (chybí, ještě neplatí nebo vypršel), selhání za sebou: 1.',
    );
    await expect(value(page, 'Poslední chyba')).toContainText(
      'Fio odmítlo token (chybí, ještě neplatí nebo vypršel) (HTTP 401)',
    );
  });

  test('when the state cannot be loaded, then a retry asks again', async ({ page }) => {
    let calls = 0;
    await page.route(
      (url) => url.pathname === IMPORT_STATE,
      (route) => {
        calls++;
        return calls === 1
          ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
          : route.fulfill({
              json: {
                coveredFrom: null,
                coveredTo: null,
                lastAttemptedAt: null,
                lastSucceededAt: null,
                lastFailure: null,
                consecutiveFailures: 0,
                reportedOutage: null,
              },
            });
      },
    );
    await rememberedSession(page, administrator);
    await page.goto('/sprava');
    const importCard = page.getByRole('region', { name: 'Stav stahování plateb z banky' });
    await expect(importCard.getByRole('alert')).toContainText('Stav importu se nepodařilo načíst.');

    await importCard.getByRole('button', { name: 'Zkusit znovu' }).click();

    await expect(value(page, 'Stažené období')).toHaveText('zatím nic');
    expect(calls).toBe(2);
  });

  test('when they move around the administration, then the side panel stays and marks the current section', async ({
    page,
  }) => {
    await mockImportState(page, quietImport);
    await page.route(
      (url) => url.pathname === '/api/admin/donations/payments',
      (route) => route.fulfill({ json: { year: null, availableYears: [], items: [] } }),
    );
    await rememberedSession(page, administrator);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/sprava');

    const panel = page.getByRole('navigation', { name: 'Správa' });
    await expect(page.getByRole('button', { name: 'Menu správy' })).toBeHidden();
    await expect(panel.getByRole('link', { name: 'Přehled', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await panel.getByRole('link', { name: 'Platby z banky' }).click();

    await expect(page).toHaveURL(/\/sprava\/platby$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Platby z banky' })).toBeFocused();
    await expect(panel.getByRole('link', { name: 'Platby z banky' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(panel.getByRole('link', { name: 'Přehled', exact: true })).not.toHaveAttribute(
      'aria-current',
    );
  });

  test('when they use a phone, then the panel opens from the menu button and closes after a pick', async ({
    page,
  }) => {
    await mockImportState(page, quietImport);
    await rememberedSession(page, administrator);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava');

    const menu = page.getByRole('button', { name: 'Menu správy' });
    const panel = page.getByRole('navigation', { name: 'Správa' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    await menu.click();

    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('link', { name: 'Zálohy' })).toBeVisible();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');

    await expect(panel).toBeHidden();
    await expect(menu).toBeFocused();

    await menu.click();
    await panel.getByRole('link', { name: 'Zálohy' }).click();

    await expect(page).toHaveURL(/\/sprava\/zalohy$/);
    await expect(panel).toBeHidden();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('when they come back later with a remembered session, then the administration opens straight away', async ({
    page,
  }) => {
    await mockImportState(page, {
      coveredFrom: null,
      coveredTo: null,
      lastAttemptedAt: null,
      lastSucceededAt: null,
      lastFailure: null,
      consecutiveFailures: 0,
      reportedOutage: null,
    });
    await rememberedSession(page, administrator);

    await page.goto('/sprava');

    await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeVisible();
  });
});

test.describe('Given a donor without the administrator role', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they sign in, then the overview offers no administration', async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole('link', { name: 'Správa' })).toHaveCount(0);
  });

  test('when they type the administration address, then they land on their own overview', async ({
    page,
  }) => {
    await rememberedSession(page, donor);

    await page.goto('/sprava');

    await expect(page).toHaveURL(/\/darce\/prehled$/);
  });

  test('when the role is taken away while the page is open, then the next load sends them to their overview', async ({
    page,
  }) => {
    await mockOverview(page);
    await page.route(
      (url) => url.pathname === IMPORT_STATE,
      (route) =>
        route.fulfill(
          problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Tato část je jen pro správce.'),
        ),
    );
    await rememberedSession(page, administrator);

    await page.goto('/sprava');

    await expect(page).toHaveURL(/\/darce\/prehled$/);
  });
});

test.describe('Given a visitor who is not signed in', () => {
  test('when they open the administration address, then the home page opens with the sign-in dialog', async ({
    page,
  }) => {
    await mockDonorApi(page);

    await page.goto('/sprava');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#login-email')).toBeFocused();
  });
});
