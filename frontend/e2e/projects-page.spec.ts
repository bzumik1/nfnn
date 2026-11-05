import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, samplePngBase64 } from './donor-session';

const PNG = Buffer.from(samplePngBase64, 'base64');
const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';

function story(
  slug: string,
  title: string,
  year: number,
  category: string,
  withPhoto = true,
): Record<string, unknown> {
  return {
    id: `0199f3e0-0000-7000-8000-${String(year)}${slug.length.toString().padStart(8, '0')}`,
    slug,
    title,
    year,
    category,
    tag: 'Pomůcky',
    perex: `Příběh ${title}.`,
    body: 'Text příběhu.',
    coverImage: withPhoto
      ? { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: null, focalPoint: null }
      : null,
    publishedOn: `${year}-10-01`,
    createdAt: `${year}-09-19T09:00:00Z`,
    updatedAt: `${year}-10-01T07:30:00Z`,
    live: true,
  };
}

const STORIES = [
  story('sofinka', 'Sofinka', 2025, 'CHILDREN'),
  story('deti-s-rakovinou', 'Děti s rakovinou', 2025, 'CHILDREN'),
  story('michal', 'Michal, hasič', 2025, 'ADULTS', false),
  story('natalka', 'Natálka', 2024, 'CHILDREN'),
  story('belinka', 'Fenka Belinka', 2024, 'ANIMALS'),
];

const LOOK_BACK = {
  id: '0199f3e0-0000-7000-8000-00000000c101',
  slug: 'ohlednuti-za-rokem-2025',
  title: 'Ohlédnutí za rokem 2025',
  tag: null,
  perex: 'Co se nám v roce 2025 podařilo.',
  body: 'Text.',
  coverImage: null,
  publishedOn: '2026-01-10',
  createdAt: '2026-01-09T09:00:00Z',
  updatedAt: '2026-01-10T07:30:00Z',
  signer: null,
  lookBackYear: 2025,
  live: true,
};

async function publishedStories(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({
        json: { items: STORIES, page: 0, size: 50, total: STORIES.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({ json: { items: [LOOK_BACK], page: 0, size: 50, total: 1, hasMore: false } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/projects/'),
    (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').pop();
      const found = STORIES.find((candidate) => candidate.slug === slug);
      return found ? route.fulfill({ json: found }) : route.fallback();
    },
  );
  await page.route(
    (url) => url.pathname === `/api/content/news/${LOOK_BACK.slug}`,
    (route) => route.fulfill({ json: LOOK_BACK }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
}

test.describe('Given a visitor on the Pomáháme tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedStories(page);
  });

  test('when it opens, then it shows the newest year with its first story large, the summary and the link to that year’s look-back', async ({
    page,
  }) => {
    await page.goto('/projekty');

    await expect(page).toHaveTitle('Kde pomáháme | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Komu jsme pomohli' })).toBeVisible();
    await expect(page.locator('.summary-tile--total')).toHaveText(
      /5\s+příběhů zveřejněných od roku 2024/,
    );
    const years = page.getByRole('navigation', { name: 'Roky' });
    await expect(years.getByRole('link')).toHaveText(['Vše', '2025', '2024']);
    await expect(years.getByRole('link', { name: '2025' })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('heading', { level: 2, name: /2025/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /2024/ })).toHaveCount(0);
    await expect(page.locator('.grid-item--large')).toHaveCount(1);
    await expect(page.locator('.grid-item--large')).toContainText('Sofinka');
    await expect(page.locator('.tile--no-photo .tile-heart')).toHaveCount(1);

    await page.getByRole('link', { name: 'Ohlédnutí za rokem 2025' }).click();
    await expect(page).toHaveURL(`/aktuality/${LOOK_BACK.slug}`);
  });

  test('when they choose a year and then Vše, then the address names the choice, the page stays where it was and Vše lists each year as a strip', async ({
    page,
  }) => {
    await page.goto('/projekty');
    const years = page.getByRole('navigation', { name: 'Roky' });

    await years.getByRole('link', { name: '2024' }).click();
    await expect(page).toHaveURL('/projekty?rok=2024');
    await expect(page.locator('p[role="status"]')).toHaveText('Rok 2024: 2 příběhy');
    await expect(page.locator('.grid-item--large')).toContainText('Natálka');

    await years.getByRole('link', { name: 'Vše' }).click();
    await expect(page).toHaveURL('/projekty?rok=vse');
    await expect(page.locator('section.year h2')).toHaveText([/2025/, /2024/]);
    await expect(page.locator('ul.strip')).toHaveCount(2);

    await page.getByRole('link', { name: /Všechny 3 z roku 2025/ }).click();
    await expect(page).toHaveURL('/projekty?rok=2025');
    await expect(page.locator('section.year')).toHaveCount(1);
  });

  test('when they open a story and return with the back button, then the year they chose shows again with the focus on the story they left', async ({
    page,
  }) => {
    await page.goto('/projekty?rok=2024');
    await page.getByRole('link', { name: 'Fenka Belinka' }).click();
    await expect(page).toHaveURL('/projekty/belinka');

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    await expect(page).toHaveURL('/projekty?rok=2024');
    await expect(page.getByRole('link', { name: 'Fenka Belinka' })).toBeFocused();
  });

  test('when the page ends, then the Přispět band leads to Přispět without a link back to this tab', async ({
    page,
  }) => {
    await page.goto('/projekty');
    const band = page.getByRole('region', { name: 'Pomozte s dalším příběhem' });

    await expect(band.getByRole('link', { name: 'Přispět' })).toHaveAttribute('href', '/prispet');
    await expect(band.getByRole('link', { name: 'Kde pomáháme' })).toHaveCount(0);
  });
});
