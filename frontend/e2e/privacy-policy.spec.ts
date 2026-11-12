import { expect, test } from './fixtures';

const policyHeading = { level: 1, name: 'Zásady ochrany osobních údajů' } as const;

test.describe('Given a visitor at the bottom of the About page', () => {
  test('when they click the privacy policy link in the footer, then the policy opens scrolled to the top', async ({
    page,
  }) => {
    await page.goto('/o-nas');
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
  test('when they click the policy link under the submit button, then the policy opens', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    const form = page.locator('#kontakt form');

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

  test('when they leave it with Zpět, which stands there without the logo, then O nás opens under its own tab title', async ({
    page,
  }) => {
    await page.goto('/zasady-ochrany-osobnich-udaju');
    const banner = page.getByRole('banner');
    await expect(banner.getByRole('link', { name: 'Nová naděje – nadační fond' })).toHaveCount(0);

    await banner.getByRole('button', { name: 'Zpět' }).click();

    await expect(page).toHaveURL(/\/o-nas$/);
    await expect(page).toHaveTitle('O nás | Nová naděje – nadační fond');
  });
});
