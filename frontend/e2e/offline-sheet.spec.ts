import type { Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { requestsInFlight, settled } from './settled';

const DISCONNECTED = (route: Route) => route.abort('internetdisconnected');
const SETTLE_BOUND_MS = 10_000;

test.describe('Given a visitor whose connection drops after the first screen, without a service worker', () => {
  test('when they press the offline label, then the sheet opens from what the page fetched while it was idle', async ({
    page,
    context,
  }) => {
    const inFlight = requestsInFlight(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nová naděje' })).toBeVisible();
    await page.evaluate(
      () => new Promise((idle) => (window.requestIdleCallback ?? setTimeout)(() => idle(null))),
    );
    await settled(page, inFlight, SETTLE_BOUND_MS);

    await page.route('**/api/**', DISCONNECTED);
    await context.setOffline(true);
    const label = page.getByRole('button', { name: /^Offline/ });
    await label.click();

    const sheet = page.getByRole('dialog', { name: 'Jste offline' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Bez připojení můžete jen prohlížet.');
    await expect(sheet.getByRole('button', { name: 'Zkusit znovu' })).toBeVisible();

    await page.unroute('**/api/**', DISCONNECTED);
    await context.setOffline(false);
  });
});
