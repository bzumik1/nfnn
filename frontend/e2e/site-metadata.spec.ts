import { expect, test } from './fixtures';
import { mockDonorApi, problem } from './donor-session';

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

  test('when an address the site does not know is opened, then the server answers 404 with the page that says so', async ({
    page,
  }) => {
    for (const path of ['/neexistuje', '/o-nass', '/sprava/neexistuje']) {
      const response = await page.goto(path);

      expect(response?.status(), path).toBe(404);
      expect(response?.headers()['content-type'], path).toBe('text/html; charset=utf-8');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Tuhle stránku jsme nenašli' }),
      ).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    }
  });

  test('when an article address names no published article, then the server answers 200 and the page asks crawlers not to index it', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/news/neznama',
      (route) => route.fulfill(problem(404, 'content/news-not-found', 'Nenalezeno', '')),
    );

    const response = await page.goto('/aktuality/neznama');

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tuhle stránku jsme nenašli' }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  test('when the web app manifest and the other text files are read, then each names UTF-8, so the Czech names read right', async ({
    request,
  }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.headers()['content-type']).toBe('application/manifest+json; charset=utf-8');
    expect(await manifest.json()).toMatchObject({ name: 'Nová naděje – nadační fond' });

    for (const path of ['/robots.txt', '/sitemap.xml', '/favicon.svg', '/ngsw.json']) {
      const answer = await request.get(path);
      expect(answer.ok(), path).toBe(true);
      expect(answer.headers()['content-type'], path).toMatch(/; charset=utf-8$/);
    }
  });
});
