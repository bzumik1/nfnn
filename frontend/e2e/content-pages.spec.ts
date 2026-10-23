import { expect, Page, test } from '@playwright/test';
import { mockDonorApi, problem } from './donor-session';

const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
  'base64',
);

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.\n\nDruhý odstavec.',
  coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}` },
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

const project = {
  id: '0199f3e0-0000-7000-8000-00000000c002',
  slug: 'dominik-7-let',
  title: 'Dominik, 7 let',
  year: 2024,
  tag: 'Kompenzační pomůcky',
  perex: 'Pomohli jsme mu získat speciální kočárek.',
  body: 'Dominik se narodil s dětskou mozkovou obrnou.\n\nDěkujeme všem dárcům.',
  coverImage: null,
  publishedOn: '2026-10-01',
  createdAt: '2026-09-19T09:00:00Z',
  updatedAt: '2026-10-01T07:30:00Z',
};

async function publishedContent(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [article], projects: [project] } }),
  );
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname === `/api/content/projects/${project.slug}`,
    (route) => route.fulfill({ json: project }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
}

test.describe('Given a visitor on the home page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when news and projects are published, then the home page shows them and each card leads to its page', async ({
    page,
  }) => {
    await publishedContent(page);

    await page.goto('/');

    const news = page.locator('#aktuality .news-card');
    await expect(news).toHaveCount(1);
    await expect(news.locator('.news-tag')).toHaveText('Projekt');
    await expect(news.locator('.news-date')).toHaveText('20. 10. 2026');
    await expect(news.locator('img')).toBeVisible();
    const projects = page.locator('#projekty app-project-card');
    await expect(projects).toHaveCount(1);
    await expect(projects.locator('.card-year')).toHaveText('2024');
    await expect(page.getByText('Pomohli jsme Dominikovi získat nový vozík')).toHaveCount(0);

    await page.getByRole('link', { name: 'Zahrada pro děti' }).click();

    await expect(page).toHaveURL('/aktuality/zahrada-pro-deti');
    await expect(page).toHaveTitle('Zahrada pro děti | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Zahrada pro děti' })).toBeFocused();
    await expect(page.locator('.ui-eyebrow')).toHaveText('Projekt · 20. 10. 2026');
    await expect(page.locator('.prose p')).toHaveText(['První odstavec.', 'Druhý odstavec.']);
    await expect(page.locator('.photo img')).toBeVisible();

    await page.getByRole('link', { name: '← Všechny aktuality' }).click();

    await expect(page).toHaveURL('/#aktuality');
    await page.getByRole('link', { name: 'Dominik, 7 let' }).click();

    await expect(page).toHaveURL('/projekty/dominik-7-let');
    await expect(page.getByRole('heading', { level: 1, name: 'Dominik, 7 let' })).toBeFocused();
    await expect(page.locator('.ui-eyebrow')).toHaveText('Kompenzační pomůcky · 2024');
    await expect(page.locator('.photo')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Zpět na projekty' })).toHaveAttribute(
      'href',
      '/#projekty',
    );
  });

  test('when nothing is published yet, then the placeholder cards stay and lead nowhere', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('#aktuality .news-card')).toHaveCount(3);
    await expect(page.locator('#projekty app-project-card')).toHaveCount(5);
    await expect(page.getByText('Pomohli jsme Dominikovi získat nový vozík')).toBeVisible();
    await expect(page.locator('#aktuality a, #projekty a')).toHaveCount(0);
  });

  test('when the address names an article that is not published, then the page says it was not found and keeps the address', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/news/neznama',
      (route) => route.fulfill(problem(404, 'content/news-not-found', 'Nenalezeno', '')),
    );

    await page.goto('/aktuality/neznama');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Tuhle stránku jsme nenašli' }),
    ).toBeVisible();
    await expect(page).toHaveURL('/aktuality/neznama');
  });
});
