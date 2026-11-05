import { expect, pwaTest as test } from './pwa-fixtures';

const MAIN_SCRIPT = /\/main-[A-Za-z0-9_-]{8}\.js$/;
const BOOT_TIMEOUT_MS = 15_000;

test.describe('Given the app script of the site never arrives', () => {
  test.use({
    allowedConsoleErrors: [
      /^Failed to load resource: net::ERR_FAILED \(http:\/\/localhost:\d+\/main-[A-Za-z0-9_-]{8}\.js\)$/,
    ],
  });

  test('when the page waits, then it loads once more by itself, then shows a panel that clears the site, and the next good start is reported once', async ({
    page,
    context,
  }) => {
    const reports: unknown[] = [];
    await context.route('**/api/operations/client-errors', (route) => {
      reports.push(route.request().postDataJSON());
      return route.fulfill({ status: 204 });
    });
    await context.route(MAIN_SCRIPT, (route) => route.abort());
    await page.clock.install();
    await page.goto('/');

    const reloaded = page.waitForEvent('load');
    await page.clock.fastForward(BOOT_TIMEOUT_MS);
    await reloaded;
    await page.clock.fastForward(BOOT_TIMEOUT_MS);

    const panel = page.getByRole('alert');
    await expect(panel.getByRole('heading', { name: 'Web se nenačetl' })).toBeVisible();
    await expect(panel).toContainText('Přihlášení a data uložená v tomto zařízení zůstanou.');
    expect(reports).toEqual([]);

    await context.unroute(MAIN_SCRIPT);
    await panel.getByRole('button', { name: 'Vyčistit a načíst znovu' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Web se nenačetl' })).toHaveCount(0);
    await expect
      .poll(() => reports)
      .toEqual([expect.objectContaining({ kind: 'boot', place: 'start-up', count: 1 })]);
  });
});
