import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';

function ringsShown(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll(':focus-visible').length);
}

test.describe('Given a visitor on a phone who opens the sign-in dialog', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('when they tap Přihlásit se, then the title of the dialog holds the focus and no control shows a focus ring', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(dialog.locator('#login-dialog-title')).toBeFocused();
    expect(await ringsShown(page)).toBe(0);
  });

  test('when they open it with the keyboard, then the e-mail field takes the focus as before', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog').locator('#login-email')).toBeFocused();
  });
});

test.describe('Given a visitor on a computer who opens the sign-in dialog', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('when they click Přihlásit se, then the title of the dialog holds the focus and no control shows a focus ring', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/aktuality');
    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(dialog.locator('#login-dialog-title')).toBeFocused();
    expect(await ringsShown(page)).toBe(0);
  });
});
