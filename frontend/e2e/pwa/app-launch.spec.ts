import { expect, pwaTest as test } from './pwa-fixtures';

test.describe('Given the app opened from its icon on the home screen of an iPhone', () => {
  test.use({ displayMode: 'ios-home-screen' });

  test('when nobody is signed in, then it opens the home page with no dialog and no field that would raise the keyboard', async ({
    page,
  }) => {
    await page.goto('/aplikace');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.activeElement?.matches('input, textarea') ?? false),
    ).toBe(false);
  });

  test('when iOS fetches the launch images the page names, then nginx serves each one as a PNG', async ({
    page,
  }) => {
    await page.goto('/aplikace');

    const addresses = await page
      .locator('link[rel="apple-touch-startup-image"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) {
      const answer = await page.request.get(address);
      expect(answer.status(), address).toBe(200);
      expect(answer.headers()['content-type'], address).toBe('image/png');
    }
  });
});
