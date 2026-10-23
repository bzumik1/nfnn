import { expect, Page, test } from '@playwright/test';
import { administrator, mockDonorApi, session } from './donor-session';

const BACKUPS = '/api/admin/operations/backups';
const REQUESTS = '/api/admin/operations/backups/requests';

function backupFile(overrides: Record<string, unknown> = {}) {
  return {
    fileName: 'nfnn-2026-10-23_0300.dump',
    kind: 'DAILY',
    sizeBytes: 1590,
    createdAt: '2026-10-23T01:00:03Z',
    ...overrides,
  };
}

function backupRun(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'OK',
    startedAt: '2026-10-23T01:00:00Z',
    finishedAt: '2026-10-23T01:00:03Z',
    fileName: 'nfnn-2026-10-23_0300.dump',
    sizeBytes: 1590,
    tables: null,
    requestId: null,
    error: null,
    ...overrides,
  };
}

function backupsView(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    backups: [
      backupFile(),
      backupFile({
        fileName: 'nfnn-2026-10-22_0300.dump',
        sizeBytes: 1000,
        createdAt: '2026-10-22T01:00:03Z',
      }),
    ],
    lastBackup: backupRun(),
    lastTestRestore: backupRun({
      startedAt: '2026-10-18T02:00:00Z',
      finishedAt: '2026-10-18T02:00:05Z',
      fileName: 'nfnn-2026-10-18_0300.dump',
      tables: 37,
    }),
    lastRestore: null,
    restoreFiles: [],
    pendingRequests: 0,
    restorePending: false,
    problems: [],
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

test.describe('Given an administrator on the backups page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when the page opens, then it shows the status, the runs and the dumps, and a dump downloads under its name', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === BACKUPS,
      (route) => route.fulfill({ json: backupsView() }),
    );
    await page.route(
      (url) => url.pathname === `${BACKUPS}/nfnn-2026-10-22_0300.dump`,
      (route) =>
        route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="nfnn-2026-10-22_0300.dump"',
          },
          body: Buffer.from('PGDMP'),
        }),
    );

    await page.goto('/sprava/zalohy');

    await expect(page).toHaveTitle('Zálohy | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Zálohy' })).toBeFocused();
    await expect(page.getByText('Zálohování je v pořádku.')).toBeVisible();
    await expect(page.locator('.run dd').first()).toHaveText(
      'Poslední záloha: 23. 10. 2026 03:00, nfnn-2026-10-23_0300.dump (2 kB).',
    );
    await expect(page.locator('tbody tr')).toHaveCount(2);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Stáhnout nfnn-2026-10-22_0300.dump' }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('nfnn-2026-10-22_0300.dump');
    await expect(
      page.getByRole('button', { name: 'Stáhnout nfnn-2026-10-22_0300.dump' }),
    ).toBeEnabled();
  });

  test('when they start a backup, then the request is posted and the page reports the finished dump', async ({
    page,
  }) => {
    let view = backupsView();
    const requests: unknown[] = [];
    await page.route(
      (url) => url.pathname === BACKUPS,
      (route) => route.fulfill({ json: view }),
    );
    await page.route(
      (url) => url.pathname === REQUESTS,
      (route) => {
        requests.push(route.request().postDataJSON());
        view = backupsView({
          backups: [
            backupFile({
              fileName: 'nfnn-2026-10-23_1000-rucni.dump',
              kind: 'REQUESTED',
              createdAt: '2026-10-23T08:00:04Z',
            }),
            ...backupsView().backups,
          ],
          lastBackup: backupRun({
            fileName: 'nfnn-2026-10-23_1000-rucni.dump',
            finishedAt: '2026-10-23T08:00:04Z',
            requestId: 'req-1',
          }),
        });
        return route.fulfill({
          status: 202,
          json: { requestId: 'req-1', kind: 'BACKUP', requestedAt: '2026-10-23T08:00:00Z' },
        });
      },
    );

    await page.goto('/sprava/zalohy');
    await page.getByRole('button', { name: 'Zálohovat teď' }).click();

    await expect(page.getByRole('button', { name: 'Zálohujeme…' })).toBeDisabled();
    await expect(page.locator('.ui-notice--status')).toHaveText(
      'Záloha nfnn-2026-10-23_1000-rucni.dump je hotová (2 kB).',
      { timeout: 10_000 },
    );
    await expect(page.locator('tbody tr').first()).toContainText('nfnn-2026-10-23_1000-rucni.dump');
    await expect(page.getByRole('button', { name: 'Zálohovat teď' })).toBeEnabled();
    expect(requests).toEqual([{ kind: 'BACKUP' }]);
  });

  test('when they restore a dump, then the dialog asks first, the page waits for the restart and reports the restore', async ({
    page,
  }) => {
    let restored = false;
    let polls = 0;
    const posted: string[] = [];
    await page.route(
      (url) => url.pathname === BACKUPS,
      (route) =>
        route.fulfill({
          json: restored
            ? backupsView({
                lastRestore: backupRun({
                  fileName: 'nfnn-2026-10-22_0300.dump',
                  requestId: 'restore-1',
                  tables: 37,
                }),
              })
            : backupsView(),
        }),
    );
    await page.route(
      (url) => url.pathname === `${BACKUPS}/nfnn-2026-10-22_0300.dump/restore`,
      (route) => {
        posted.push(route.request().method());
        restored = true;
        return route.fulfill({
          status: 202,
          json: {
            requestId: 'restore-1',
            fileName: 'nfnn-2026-10-22_0300.dump',
            requestedAt: '2026-10-23T19:30:00Z',
          },
        });
      },
    );
    await page.route(
      (url) => url.pathname === '/api/operations/setup',
      (route) =>
        polls++ < 1
          ? route.fulfill({ status: 502, body: '' })
          : route.fulfill({ json: { required: false, codeRequired: true, lastRestore: null } }),
    );

    await page.goto('/sprava/zalohy');
    await page
      .getByRole('button', { name: 'Obnovit databázi ze zálohy nfnn-2026-10-22_0300.dump' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Obnovit databázi ze zálohy?' }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Zrušit' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Obnovit a restartovat web' }).click();

    await expect(page.getByRole('heading', { name: 'Obnova ze zálohy' })).toBeVisible();
    await expect(page.locator('.ui-notice--status')).toHaveText(
      'Databáze je obnovená ze zálohy nfnn-2026-10-22_0300.dump. Stav před obnovou je uložený jako záloha „Před obnovou“.',
      { timeout: 15_000 },
    );
    expect(posted).toEqual(['POST']);
  });

  test('when the backup folder is not connected, then the problems are named and the actions are disabled', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === BACKUPS,
      (route) =>
        route.fulfill({
          json: backupsView({
            available: false,
            backups: [],
            lastBackup: null,
            lastTestRestore: null,
            problems: ['BACKUPS_UNAVAILABLE'],
          }),
        }),
    );

    await page.goto('/sprava/zalohy');

    await expect(page.getByRole('alert')).toContainText('Backend nevidí složku záloh.');
    await expect(page.getByRole('button', { name: 'Zálohovat teď' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ověřit obnovu teď' })).toBeDisabled();
    await expect(page.getByText('Zatím žádná záloha.')).toBeVisible();
  });
});
