import { expect, test } from './fixtures';
import { LOGGERS, rememberedAdministrator, routeLogsApi } from './admin-logs-api';
import { stepBack } from './app-history';
import { mockDonorApi } from './donor-session';

test.describe('Given an administrator on the logs hub', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await routeLogsApi(page);
    await rememberedAdministrator(page);
  });

  test('when they open backend.log from the hub, then its newest entries come first, older ones load below and an error opens its surroundings', async ({
    page,
  }) => {
    await page.goto('/sprava/logy');

    await expect(page).toHaveTitle('Logy a diagnostika | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Logy a diagnostika' })).toBeFocused();
    await expect(page.getByRole('link', { name: /Bez poruchy/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Starší soubory/ })).toContainText('1');

    await page.getByRole('link', { name: /backend\.log Aplikace/ }).click();
    await expect(page).toHaveURL('/sprava/logy/soubor?nazev=backend.log');
    await expect(page.getByRole('heading', { level: 1, name: 'backend.log' })).toBeFocused();
    await expect(page.locator('.entry').first()).toContainText('line 39');
    await expect(page.locator('.entry')).toHaveCount(40);

    await page.getByRole('button', { name: 'Načíst starší řádky' }).click();
    await expect(page.locator('.entry')).toHaveCount(80);

    await page.getByRole('radio', { name: 'Chyby', exact: true }).click();
    await expect(page.locator('.entry')).toHaveCount(2);
    await page.locator('.entry').first().click();
    const sheet = page.getByRole('dialog', { name: 'Chyba v 10:00:38' });
    await expect(sheet).toContainText('c.n.a.d.i.fio.FioBankStatementSource');
    const opened = page.waitForRequest(
      (request) => new URL(request.url()).searchParams.get('from') === '41000',
    );
    await sheet.getByRole('button', { name: 'Zobrazit okolí' }).click();
    await opened;
    await expect(page.getByRole('radio', { name: 'Vše', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('.entry.is-focused')).toBeFocused();

    await stepBack(page);
    await expect(page).toHaveURL('/sprava/logy');
  });

  test('when they open the older files on a phone, then the archive of each series leads to its reader', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava/logy');

    await page.getByRole('link', { name: /Starší soubory/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Starší soubory' })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Aplikace' })).toBeVisible();

    await page.getByRole('link', { name: /backend\.log\.2026-10-22\.0\.gz/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'backend.log.2026-10-22.0.gz' }),
    ).toBeVisible();
    await expect(page.locator('.entry').first()).toContainText('line 39');
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
    await page.getByRole('link', { name: 'Úrovně logování' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Úrovně logování' })).toBeFocused();
    await page.getByRole('button', { name: /^Aplikace cz\.novanadeje\.app/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Úroveň loggeru cz.novanadeje.app' });
    await expect(sheet.getByRole('radio', { name: 'DEBUG' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await sheet.getByRole('button', { name: 'Nastavit na 30 min' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'má úroveň DEBUG' })).toHaveText(
      'Logger cz.novanadeje.app má úroveň DEBUG do 23. 10. 2026 12:30.',
    );
    await expect(page.locator('.overrides .ui-list__row')).toContainText('INFO → DEBUG');

    await page.getByRole('button', { name: 'Vrátit úroveň loggeru cz.novanadeje.app' }).click();
    await expect(page.locator('.overrides')).toHaveCount(0);
    await expect(page.getByText('Logger cz.novanadeje.app má zase původní úroveň.')).toBeVisible();
  });

  test('when they open the server state and the thread dump on a phone, then each reads as its own page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava/logy');

    await page.getByRole('link', { name: /Bez poruchy/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Stav serveru' })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Bez poruchy' })).toBeVisible();
    await expect(page.locator('.database')).toContainText('za 2 ms');

    await stepBack(page);
    await page.getByRole('link', { name: 'Výpis vláken' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Výpis vláken' })).toBeFocused();
    await expect(page.locator('.states')).toContainText('Běží');
    await expect(page.locator('.dump')).toContainText('"main" #1 state=RUNNABLE');
  });
});
