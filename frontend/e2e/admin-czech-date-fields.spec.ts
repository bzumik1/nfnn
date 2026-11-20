import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, session } from './donor-session';

const importState = {
  coveredFrom: '2026-07-20',
  coveredTo: '2026-10-17',
  lastAttemptedAt: '2026-10-18T08:05:30Z',
  lastSucceededAt: '2026-10-18T08:05:30Z',
  lastFailure: null,
  consecutiveFailures: 0,
  reportedOutage: null,
  historyImport: null,
  defaultHistoryFrom: '2026-01-01',
};

const backupRun = {
  outcome: 'OK',
  startedAt: '2026-10-23T01:00:00Z',
  finishedAt: '2026-10-23T01:00:03Z',
  fileName: 'nfnn-2026-10-23_0300.dump.age',
  sizeBytes: 1590,
  tables: 37,
  requestId: null,
  error: null,
};

const backups = {
  available: true,
  backups: [],
  lastBackup: backupRun,
  lastTestRestore: backupRun,
  lastRestore: null,
  restoreFiles: [],
  pendingRequests: 0,
  restorePending: false,
  problems: [],
  schedule: {
    backupTime: '03:00',
    testRestoreDay: 7,
    testRestoreTime: '04:00',
    applied: { backupTime: '03:00', testRestoreDay: 7, testRestoreTime: '04:00' },
  },
  key: { available: true, confirmed: true, confirmedAt: '2026-10-23T08:00:00Z' },
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator whose browser draws native date fields in its own order', () => {
  test.use({ locale: 'cs-CZ', timezoneId: 'Europe/Prague' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/admin/donations/import-state',
      (route) => route.fulfill({ json: importState }),
    );
    await page.route(
      (url) => url.pathname === '/api/admin/operations/backups',
      (route) => route.fulfill({ json: backups }),
    );
    await rememberedSession(page);
  });

  test('when they open the older payments, the payments and the backups on a computer, then every date field names the chosen day in Czech under it and the time fields keep their own hints', async ({
    page,
  }) => {
    await page.goto('/sprava');
    await expect(page.getByLabel('Stáhnout platby od')).toHaveAccessibleDescription(
      /^Vybraný den: 1\.\s1\. 2026\. Platby za posledních 89\sdní/,
    );

    await page.goto('/sprava/platby?od=2026-10-01&do=2026-10-05');
    await expect(page.locator('#payments-from')).toHaveAccessibleDescription(
      /^Vybraný den: 1\.\s10\. 2026\.$/,
    );
    await expect(page.locator('#payments-to')).toHaveAccessibleDescription(
      /^Vybraný den: 5\.\s10\. 2026\.$/,
    );

    await page.goto('/sprava/zalohy');
    await expect(page.getByLabel('Denní záloha')).toHaveAccessibleDescription(
      'Čas, kdy se databáze každý den zálohuje.',
    );
    await expect(page.getByLabel('Čas zkušební obnovy')).toHaveAccessibleDescription('');
  });

  test('when they open the older payments and the payments on a phone, then no Czech line repeats the chosen day, as the phone shows it in its own words', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/sprava');
    await expect(page.getByLabel('Stáhnout platby od')).toHaveAccessibleDescription(
      /^Platby za posledních 89\sdní/,
    );

    await page.goto('/sprava/platby?od=2026-10-01&do=2026-10-05');
    await expect(page.locator('#payments-from')).toHaveValue('2026-10-01');
    await expect(page.locator('#payments-from')).toHaveAccessibleDescription('');
    await expect(page.locator('#payments-to')).toHaveAccessibleDescription('');
  });
});
