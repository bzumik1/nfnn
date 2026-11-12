import type { BrowserContext, Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

const DISCONNECTED = (route: Route) => route.abort('internetdisconnected');

async function goOffline(page: Page, context: BrowserContext): Promise<void> {
  await page.route('**/api/**', DISCONNECTED);
  await context.setOffline(true);
}

async function goOnline(page: Page, context: BrowserContext): Promise<void> {
  await page.unroute('**/api/**', DISCONNECTED);
  await context.setOffline(false);
}

test.describe('Given a visitor whose sign-in dialog is open', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/darce/prehled');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog').locator('#login-email')).toBeVisible();
  });

  test('when the connection drops, then the dialog says at once that signing in needs a connection instead of showing forms that cannot be sent', async ({
    page,
    context,
  }) => {
    await goOffline(page, context);

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { level: 3, name: 'Jste offline' })).toBeVisible();
    await expect(dialog).toContainText('Přihlásit se ani zaregistrovat se bez připojení nejde.');
    await expect(dialog.locator('#login-email')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Registrace' })).toHaveCount(0);

    await goOnline(page, context);
  });

  test('when the connection comes back, then the sign-in form is there again by itself', async ({
    page,
    context,
  }) => {
    await goOffline(page, context);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { level: 3, name: 'Jste offline' })).toBeVisible();

    await goOnline(page, context);

    await expect(dialog.locator('#login-email')).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 3, name: 'Jste offline' })).toHaveCount(0);
  });
});
