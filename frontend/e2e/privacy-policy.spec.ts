import { expect, test } from './fixtures';

const policyHeading = { level: 1, name: 'Zásady ochrany osobních údajů' } as const;

test.describe('Given a visitor at the bottom of the About page', () => {
  test('when they click the privacy policy link in the note under the contact section, then the policy opens scrolled to the top', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    const noteLink = page
      .locator('#kontakt .contact-legal')
      .getByRole('link', { name: 'zásady ochrany osobních údajů' });
    await noteLink.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await noteLink.click();

    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju$/);
    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe('Given a visitor on Přispět', () => {
  test('when they click the policy link in the note on what comes next, then the policy opens at the data it processes', async ({
    page,
  }) => {
    await page.goto('/prispet');

    await page
      .locator('#prispet .donate-privacy')
      .getByRole('link', { name: 'zásady ochrany osobních údajů' })
      .click();

    await expect(page).toHaveURL(/\/zasady-ochrany-osobnich-udaju#udaje$/);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Jaké údaje zpracováváme a proč' }),
    ).toBeInViewport();
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

test.describe('Given a visitor reading the privacy policy on a computer', () => {
  test('when they follow an entry of the contents, then the contents stays in view beside the text and marks the section they are reading', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/zasady-ochrany-osobnich-udaju');
    const contents = page.getByRole('navigation', { name: 'Obsah' });

    await contents.getByRole('link', { name: 'Vaše práva' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Vaše práva' })).toBeInViewport();
    await expect(contents).toBeInViewport({ ratio: 1 });
    await expect(contents.locator('a[aria-current="location"]')).toHaveText('Vaše práva');
  });
});

test.describe('Given a visitor reading the privacy policy on a phone', () => {
  test('when they follow an entry of the contents, then the contents stays at the top of the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/zasady-ochrany-osobnich-udaju');
    const contents = page.getByRole('navigation', { name: 'Obsah' });

    await contents.getByRole('link', { name: 'Vaše práva' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Vaše práva' })).toBeInViewport();
    await expect(contents).not.toBeInViewport();
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
