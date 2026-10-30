import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  administrator,
  donor,
  mockDonorApi,
  adminSettings,
  problem,
  receiptSigningKeys,
  session,
  signIn,
} from './donor-session';

const IMPORT_STATE = '/api/admin/donations/import-state';
const OVERVIEW = '/api/admin/donations/overview';
const BACKUPS = '/api/admin/operations/backups';
const PAYMENTS = '/api/admin/donations/payments';
const ADMINISTRATORS = '/api/admin/donors/administrators';
const PREVIOUS_SIGN_IN = '/api/admin/donors/me/previous-sign-in';
const SINCE = '/api/admin/donations/overview/since';
const SIGNING_KEYS = '/api/admin/donations/receipt-signing-keys';

const backups = {
  available: true,
  backups: [],
  lastBackup: {
    outcome: 'OK',
    startedAt: '2026-10-23T01:00:00Z',
    finishedAt: '2026-10-23T01:00:03Z',
    fileName: 'nfnn-2026-10-23_0300.dump.age',
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
  givingDonors: 2,
  received: { count: 5, totalMinor: 288350, currency: 'CZK' },
  paired: { count: 4, totalMinor: 273350, currency: 'CZK' },
  unpaired: { count: 1, totalMinor: 15000, currency: 'CZK' },
  months: [
    {
      month: '2026-10',
      received: { count: 1, totalMinor: 99900, currency: 'CZK' },
      newDonors: 1,
      givingDonors: 1,
      paired: { count: 1, totalMinor: 99900, currency: 'CZK' },
      unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
    },
    {
      month: '2026-09',
      received: { count: 3, totalMinor: 168450, currency: 'CZK' },
      newDonors: 1,
      givingDonors: 2,
      paired: { count: 2, totalMinor: 153450, currency: 'CZK' },
      unpaired: { count: 1, totalMinor: 15000, currency: 'CZK' },
    },
    {
      month: '2026-08',
      received: { count: 1, totalMinor: 20000, currency: 'CZK' },
      newDonors: 1,
      givingDonors: 1,
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
                givingDonors: 1,
                received: { count: 1, totalMinor: 50000, currency: 'CZK' },
                paired: { count: 1, totalMinor: 50000, currency: 'CZK' },
                unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
                months: [
                  {
                    month: '2025-12',
                    received: { count: 1, totalMinor: 50000, currency: 'CZK' },
                    newDonors: 0,
                    givingDonors: 1,
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

async function mockSince(page: Page, previousSignInAt: string | null): Promise<void> {
  await page.route(
    (url) => url.pathname === PREVIOUS_SIGN_IN,
    (route) => route.fulfill({ json: { previousSignInAt } }),
  );
  await page.route(
    (url) => url.pathname === SINCE,
    (route) =>
      route.fulfill({
        json: {
          from: new URL(route.request().url()).searchParams.get('from'),
          payments: { count: 5, totalMinor: 1250000, currency: 'CZK' },
          paired: { count: 3, totalMinor: 750000, currency: 'CZK' },
          unpaired: { count: 2, totalMinor: 500000, currency: 'CZK' },
          newDonors: 3,
        },
      }),
  );
}

async function mockBackups(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === BACKUPS,
    (route) => route.fulfill({ json: backups }),
  );
}

async function mockAttentionSources(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === PAYMENTS,
    (route) =>
      route.fulfill({
        json: {
          year: null,
          availableYears: [2026, 2025],
          total: 1,
          items: [
            {
              id: '019a1c00-0000-7000-8000-000000001001',
              bankTransactionId: 1001,
              bookedOn: '2026-09-10',
              amountMinor: 15000,
              currency: 'CZK',
              variableSymbol: null,
              counterpartyAccount: '2900233333/2010',
              counterpartyName: 'Nováková Jana',
              messageForRecipient: null,
              importedAt: '2026-09-10T10:00:00Z',
              unpairedByAdminAt: null,
              donation: null,
            },
          ],
        },
      }),
  );
  await page.route(
    (url) => url.pathname === ADMINISTRATORS,
    (route) =>
      route.fulfill({
        json: {
          items: [
            {
              donorId: administrator.id,
              name: administrator.name,
              email: administrator.email,
              secondFactorEnabled: true,
            },
          ],
        },
      }),
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
    await mockAttentionSources(page);
    await mockSince(page, '2026-10-28T20:14:00Z');
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
    expect(authorization).toEqual(['Bearer token-1']);
    const attention = page.getByRole('region', { name: 'Co potřebuje vaši pozornost' });
    await expect(attention.locator('.attention-list > li')).toHaveText([
      '1 platba čeká na přiřazení dárci (150 Kč). Přiřadit platby',
      'Zatím se nevyzkoušelo, že jde zálohu obnovit. Spusťte Ověřit obnovu teď. Otevřít zálohy',
      'Potvrzení o daru zatím nemají nahraný podpis, jen čáru se jménem. Nahrát podpis',
    ]);
    await expect(attention.getByRole('link', { name: 'Přiřadit platby' })).toHaveAttribute(
      'href',
      '/sprava/platby',
    );
    await expect(attention.getByRole('link', { name: 'Nahrát podpis' })).toHaveAttribute(
      'href',
      '/sprava/nastaveni#settings-RECEIPTS',
    );
    const backupsCard = page.getByRole('region', { name: 'Zálohy databáze' });
    await expect(backupsCard).toContainText('23. 10. 2026 03:00 (2 kB)');
    await expect(backupsCard.getByRole('link', { name: 'Otevřít zálohy' })).toHaveAttribute(
      'href',
      '/sprava/zalohy',
    );
    await expect(
      page.getByText('Registrovaní dárci: 3, z toho nových v roce 2026: 3.'),
    ).toBeVisible();
    await expect(page.locator('.overview-table tbody tr')).toHaveText([
      'říjen 2026 1 1 1 999 Kč 999 Kč 0 Kč',
      'září 2026 3 2 1 1 684,50 Kč 1 534,50 Kč 150 Kč',
      'srpen 2026 1 1 1 200 Kč 200 Kč 0 Kč',
    ]);
    await expect(page.locator('.overview-table tfoot tr')).toHaveText(
      'Celkem 2026 5 2 3 2 883,50 Kč 2 733,50 Kč 150 Kč',
    );
    await expect(page.locator('#admin-overview-hint')).toHaveText(
      'Dárci: kolik různých dárců v měsíci poslalo dar; platby bez dárce se nepočítají. Noví dárci: kolik dárců se v měsíci zaregistrovalo.',
    );

    await page.getByLabel('Rok').selectOption('2025');

    await expect(
      page.getByText('Registrovaní dárci: 3, z toho nových v roce 2025: 0.'),
    ).toBeVisible();
    await expect(page.locator('.overview-table tbody tr')).toHaveText([
      'prosinec 2025 1 1 0 500 Kč 500 Kč 0 Kč',
    ]);

    await page.getByRole('link', { name: 'Můj přehled', exact: true }).click();

    await expect(page).toHaveURL(/\/darce\/prehled$/);
  });

  test('when they come back after an earlier sign-in, then the overview opens with what came in since then and leads to the waiting payments', async ({
    page,
  }) => {
    await mockImportState(page, quietImport);
    await rememberedSession(page, administrator);

    await page.goto('/sprava');

    const since = page.getByRole('region', { name: 'Od posledního přihlášení' });
    await expect(since).toContainText(
      'Poslední přihlášení 28. 10. 2026 21:14. Od té doby přišlo 5 plateb za 12 500 Kč.',
    );
    await expect(since.getByRole('link', { name: '3 platby za 7 500 Kč' })).toHaveAttribute(
      'href',
      '/sprava/platby?stav=prirazene&od=2026-10-28',
    );
    await expect(since.getByRole('link', { name: '3 nové registrace' })).toHaveAttribute(
      'href',
      '/sprava/darci',
    );

    await since.getByRole('link', { name: '2 platby za 5 000 Kč' }).click();

    await expect(page).toHaveURL(/\/sprava\/platby\?od=2026-10-28$/);
    await expect(page.getByLabel('Od', { exact: true })).toHaveValue('2026-10-28');
  });

  test('when they sign in to the administration for the first time, then the block says there is nothing to compare yet', async ({
    page,
  }) => {
    await mockSince(page, null);
    await mockImportState(page, quietImport);
    await rememberedSession(page, administrator);

    await page.goto('/sprava');

    await expect(page.getByRole('region', { name: 'Od posledního přihlášení' })).toContainText(
      'Jste tu poprvé. Od příštího přihlášení tu uvidíte nové platby a nové dárce.',
    );
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

    const attention = page.getByRole('region', { name: 'Co potřebuje vaši pozornost' });
    await expect(attention).toContainText(
      'Platby z banky se nestahují (1× za sebou) a fond o tom dostal e-mail. Důvod: Fio odmítlo token (chybí, ještě neplatí nebo vypršel).',
    );
    await expect(attention).toContainText('vytvořte nový token typu „Sledování účtu“');
    await expect(attention.getByRole('link', { name: 'Otevřít Nastavení' })).toHaveAttribute(
      'href',
      '/sprava/nastaveni',
    );
    await expect(value(page, 'Poslední chyba')).toContainText(
      'Fio odmítlo token (chybí, ještě neplatí nebo vypršel) 18. 10. 2026 11:00 (HTTP 401)',
    );
  });

  test('when the receipt signing key of the server fails its seal, then a red row leads to the key in the settings, which names it unpublished', async ({
    page,
  }) => {
    const unpublished = {
      ...receiptSigningKeys,
      currentKeyPublished: false,
      keys: receiptSigningKeys.keys.map((key) => ({ ...key, published: false })),
    };
    await mockImportState(page, quietImport);
    await page.route(
      (url) => url.pathname === SIGNING_KEYS,
      (route) => route.fulfill({ json: unpublished }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/settings',
      (route) => route.fulfill({ json: adminSettings }),
    );
    await rememberedSession(page, administrator);

    await page.goto('/sprava');
    const attention = page.getByRole('region', { name: 'Co potřebuje vaši pozornost' });
    const row = attention.locator('.attention-signing-key');
    await expect(row).toHaveText(
      'Klíč 21fe31df není zveřejněný, proto se QR kódy jím podepsané neověří. Jeho záznam v databázi chybí nebo neprošel kontrolou pečeti (změna mimo web nebo záloha jiného serveru, kterou server nepřevzal); obraťte se na technika serveru. Otevřít nastavení',
    );
    await row.getByRole('link', { name: 'Otevřít nastavení' }).click();

    await expect(page).toHaveURL(/\/sprava\/nastaveni#klic-k-overovacim-qr$/);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Klíč k ověřovacím QR kódům' }),
    ).toBeFocused();
    const card = page.getByRole('region', { name: 'Klíč k ověřovacím QR kódům' });
    await expect(card.locator('dd')).toHaveText(['21fe31df', '13. 11. 2026 12:00', 'Nezveřejněný']);
    await expect(card.getByRole('alert').filter({ hasText: /\S/ })).toContainText(
      'Klíč 21fe31df není zveřejněný',
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

  test('when they type the administration address, then they land on their own overview, which says why', async ({
    page,
  }) => {
    await rememberedSession(page, donor);

    await page.goto('/sprava');

    await expect(page).toHaveURL(/\/darce\/prehled$/);
    await expect(page.locator('.admin-refusal')).toHaveText(
      'Tento účet nemá přístup do správy. Pokud ho potřebujete, požádejte jiného správce, aby vám ho přidělil.',
    );
  });

  test('when an administrator signed in without the second factor types the address, then the overview says how to open the administration', async ({
    page,
  }) => {
    await rememberedSession(page, {
      ...donor,
      secondFactor: { enabled: false, neededForAdministration: true },
    });

    await page.goto('/sprava');

    await expect(page).toHaveURL(/\/darce\/prehled$/);
    const refusal = page.locator('.admin-refusal');
    await expect(refusal).toContainText(
      'Správa se vám otevře, až se přihlásíte přístupovým klíčem',
    );
    await refusal.getByRole('link', { name: 'Údaje a zabezpečení' }).click();
    await expect(page).toHaveURL(/\/darce\/udaje$/);
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

test.describe('Given a visitor who is not signed in', () => {
  test('when they open the administration, then the sign-in dialog says it leads into the administration', async ({
    page,
  }) => {
    await mockDonorApi(page);

    await page.goto('/sprava');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Pro vstup do správy se přihlaste.');
    await expect(dialog).not.toContainText('Přístup do vašeho přehledu příspěvků');
  });
});
