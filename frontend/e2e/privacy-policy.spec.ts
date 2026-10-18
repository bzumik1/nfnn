import { expect, test } from '@playwright/test';

const policyHeading = { level: 1, name: 'Zásady ochrany osobních údajů' } as const;

test.describe('Given a visitor at the bottom of the home page', () => {
  test('when they click the privacy policy link in the footer, then the policy opens scrolled to the top', async ({
    page,
  }) => {
    await page.goto('/');
    const footerLink = page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Zásady ochrany osobních údajů' });
    await footerLink.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await footerLink.click();

    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe('Given a visitor at the contact form', () => {
  test('when they click the policy link under the submit button, then the policy opens', async ({ page }) => {
    await page.goto('/');
    const form = page.locator('#contact form');

    await form.getByRole('link', { name: 'zásady ochrany osobních údajů' }).click();

    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
  });
});

test.describe('Given a visitor with a direct link to the privacy policy', () => {
  test('when they open it, then the policy renders under its own tab title', async ({ page }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');

    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Vaše práva' })).toBeVisible();
    await expect(page).toHaveTitle('Zásady ochrany osobních údajů | Nová naděje – nadační fond');
  });

  test('when they go back to the home page through the logo, then the tab shows the site name again', async ({
    page,
  }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');

    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Nová naděje – nadační fond' })
      .click();

    await expect(page).toHaveURL(/\/#home$/);
    await expect(page).toHaveTitle('Nová naděje – nadační fond');
  });
});
