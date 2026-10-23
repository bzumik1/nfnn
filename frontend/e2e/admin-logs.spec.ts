import { expect, test } from './fixtures';
import { LOGGERS, rememberedAdministrator, routeLogsApi } from './admin-logs-api';
import { mockDonorApi } from './donor-session';

test.describe('Given an administrator on the logs page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await routeLogsApi(page);
    await rememberedAdministrator(page);
  });

  test('when the page opens, then the tail of backend.log is shown and older lines and a search are reachable', async ({
    page,
  }) => {
    await page.goto('/sprava/logy');

    await expect(page).toHaveTitle('Logy a diagnostika | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Logy a diagnostika' })).toBeFocused();
    await expect(page.locator('.log-text').first()).toContainText('INFO line 39');
    await expect(page.locator('.range')).toHaveText('Bajty 32000–52000 z 52000');

    await page.getByRole('button', { name: '← Starší' }).click();
    await expect(page.locator('.range')).toHaveText('Bajty 12000–32000 z 52000');

    await page.getByLabel('Hledat', { exact: true }).fill('fio');
    await page.getByRole('button', { name: 'Hledat', exact: true }).click();
    await expect(page.locator('.match')).toHaveCount(2);
    await page.locator('.match').first().click();
    await expect(page.locator('.range')).toHaveText('Bajty 51000–71000 z 52000');
  });

  test('when they raise a logger for half an hour, then the level is put and the list shows it until it is reset', async ({
    page,
  }) => {
    let override: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === `${LOGGERS}/cz.novanadeje.app`,
      async (route) => {
        if (route.request().method() === 'PUT') {
          override = {
            logger: 'cz.novanadeje.app',
            level: 'DEBUG',
            configuredBefore: 'INFO',
            since: '2026-10-23T10:00:00Z',
            until: '2026-10-23T10:30:00Z',
            adminId: '019a1c00-0000-7000-8000-000000000001',
          };
          return route.fulfill({ json: override });
        }
        override = null;
        return route.fulfill({ status: 204 });
      },
    );
    await page.route(
      (url) => url.pathname === LOGGERS,
      (route) =>
        route.fulfill({
          json: {
            loggers: [
              { logger: 'ROOT', configuredLevel: 'INFO', effectiveLevel: 'INFO', override: null },
              {
                logger: 'cz.novanadeje.app',
                configuredLevel: 'INFO',
                effectiveLevel: override === null ? 'INFO' : 'DEBUG',
                override,
              },
            ],
          },
        }),
    );

    await page.goto('/sprava/logy');
    await page.getByLabel('Logger').fill('cz.novanadeje.app');
    await page.getByRole('button', { name: 'Nastavit' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'má úroveň DEBUG' })).toHaveText(
      'Logger cz.novanadeje.app má úroveň DEBUG do 23. 10. 2026 12:30.',
    );
    await expect(page.locator('.levels tr.overridden')).toHaveCount(1);

    await page.getByRole('button', { name: 'Vrátit úroveň loggeru cz.novanadeje.app' }).click();
    await expect(page.locator('.levels tr.overridden')).toHaveCount(0);
    await expect(page.getByText('Logger cz.novanadeje.app má zase původní úroveň.')).toBeVisible();
  });

  test('when they ask for the thread dump on a phone, then it opens below the diagnostics', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava/logy');

    await page.getByRole('button', { name: 'Zobrazit výpis vláken' }).click();
    await expect(page.locator('#logs-threads .log-text')).toContainText('"main" #1 state=RUNNABLE');
    await expect(page.getByRole('button', { name: 'Skrýt výpis vláken' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
