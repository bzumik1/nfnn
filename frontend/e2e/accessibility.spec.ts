import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { mockDonorApi, openSignInDialog, signIn } from './donor-session';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
}

test.describe('Given a visitor who relies on WCAG 2.2 AA', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they open the home page, then nothing on it breaks the rules', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.qr-code img')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they open the privacy policy, then nothing on it breaks the rules', async ({ page }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');

    expect(await violations(page)).toEqual([]);
  });

  test('when they open a password reset link, then nothing on the page breaks the rules', async ({ page }) => {
    await page.goto('/obnova-hesla#token=abc');
    await expect(page.locator('h1')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they open the sign-in dialog and its company registration, then nothing in it breaks the rules', async ({ page }) => {
    await openSignInDialog(page);
    expect(await violations(page)).toEqual([]);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Registrace' }).click();
    await dialog.getByRole('radio', { name: 'Firma' }).click();

    expect(await violations(page)).toEqual([]);
  });

  test('when a signed-in donor opens the overview, then nothing on it breaks the rules', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('.symbol-value')).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('when they press Tab first, then the skip link appears and takes them to the content', async ({ page }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Přeskočit na obsah' });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(page.locator('main')).toBeFocused();
    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
  });
});
