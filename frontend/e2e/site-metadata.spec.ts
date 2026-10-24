import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';

test.describe('Given a crawler or a link preview of the site', () => {
  test('when robots.txt and the sitemap are read, then the site is open, the portal is kept out and the public pages are listed', async ({
    request,
  }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBe(true);
    const rules = await robots.text();
    expect(rules).toContain('User-agent: *');
    for (const path of ['/api/', '/mcp', '/darce/', '/sprava/', '/obnova-hesla']) {
      expect(rules).toContain(`Disallow: ${path}`);
    }
    expect(rules).toContain('Allow: /');
    expect(rules).toContain('Sitemap: https://nfnn.cz/sitemap.xml');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    const locations = (await sitemap.text()).match(/<loc>([^<]+)<\/loc>/g) ?? [];
    expect(locations).toEqual([
      '<loc>https://nfnn.cz/</loc>',
      '<loc>https://nfnn.cz/aktuality</loc>',
      '<loc>https://nfnn.cz/projekty</loc>',
      '<loc>https://nfnn.cz/zasady-ochrany-osobnich-udaju</loc>',
    ]);
  });

  test('when a page opens, then its canonical address and og:url name it on nfnn.cz and the preview image is served', async ({
    page,
    request,
  }) => {
    await mockDonorApi(page);
    await page.goto('/zasady-ochrany-osobnich-udaju?utm_source=newsletter#top');

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      'href',
      'https://nfnn.cz/zasady-ochrany-osobnich-udaju',
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      'https://nfnn.cz/zasady-ochrany-osobnich-udaju',
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://nfnn.cz/images/og-image.jpg',
    );

    const image = await request.get('/images/og-image.jpg');
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toBe('image/jpeg');
  });
});
