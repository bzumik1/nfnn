import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, session } from './donor-session';

const DAY = 31;
const MONTH = 12;
const YEAR = 275760;
const HOUR_OF_DAY = 23;
const MINUTE = 59;

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

async function fieldParts(page: Page, id: string): Promise<number[]> {
  const cdp = await page.context().newCDPSession(page);
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: `document.getElementById(${JSON.stringify(id)})`,
  });
  const { nodes } = await cdp.send('Accessibility.queryAXTree', {
    objectId: result.objectId,
    role: 'spinbutton',
  });
  await cdp.detach();
  return nodes.map((node) =>
    Number(node.properties?.find((property) => property.name === 'valuemax')?.value.value),
  );
}

test.describe('Given an administrator whose browser is set to Czech', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'reads the parts of a native field through the Chromium accessibility tree; Safari on macOS takes the order from the system region, which the device checklist covers',
  );
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

  test('when they open the older payments, the payments and the backups, then every date field reads day, month and year and every time field runs on 24 hours', async ({
    page,
  }) => {
    await page.goto('/sprava');
    await expect(page.getByLabel('Stáhnout platby od')).toHaveValue('2026-01-01');
    expect(await fieldParts(page, 'history-from')).toEqual([DAY, MONTH, YEAR]);

    await page.goto('/sprava/platby');
    await expect(page.locator('#payments-from')).toBeVisible();
    expect(await fieldParts(page, 'payments-from')).toEqual([DAY, MONTH, YEAR]);
    expect(await fieldParts(page, 'payments-to')).toEqual([DAY, MONTH, YEAR]);

    await page.goto('/sprava/zalohy');
    await expect(page.getByLabel('Denní záloha')).toHaveValue('03:00');
    expect(await fieldParts(page, 'backup-time')).toEqual([HOUR_OF_DAY, MINUTE]);
    expect(await fieldParts(page, 'test-restore-time')).toEqual([HOUR_OF_DAY, MINUTE]);
  });
});
