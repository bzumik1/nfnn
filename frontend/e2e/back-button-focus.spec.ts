import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const paragraph =
  'Díky vašim darům jsme letos mohli pomoci dětem, které potřebují rehabilitaci, pomůcky a kousek obyčejného dětství.';

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c301',
  slug: 'dlouhy-clanek',
  title: 'Ohlédnutí za rokem',
  tag: 'Výroční ohlédnutí',
  perex: 'Co všechno se letos podařilo.',
  body: [
    ...Array.from({ length: 14 }, () => paragraph),
    'Více na [stránce o nás](/o-nas).',
    ...Array.from({ length: 8 }, () => paragraph),
  ].join('\n\n'),
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

async function articleServed(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
}

function back(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

const poses = [
  { name: 'a phone 320 px wide', width: 320, height: 568, text: '100%' },
  { name: 'a phone 390 px wide', width: 390, height: 844, text: '100%' },
  { name: 'a phone 440 px wide', width: 440, height: 956, text: '100%' },
  { name: 'a phone on its side', width: 844, height: 390, text: '100%' },
  { name: 'a phone 320 px wide with text twice as large', width: 320, height: 568, text: '200%' },
  { name: 'a phone on its side with text twice as large', width: 844, height: 390, text: '200%' },
];

for (const pose of poses) {
  test.describe(`Given a visitor reading a long article on ${pose.name}`, () => {
    test.use({ viewport: { width: pose.width, height: pose.height } });

    test.beforeEach(async ({ page }) => {
      await articleServed(page);
      await page.goto(`/aktuality/${article.slug}`);
      await page.addStyleTag({ content: `html { font-size: ${pose.text}; }` });
      await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
    });

    test('when the text scrolls up under the back button and a link in it takes the focus, then the link lands below the button', async ({
      page,
    }) => {
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), pose.height * 2);

      const link = page.getByRole('main').getByRole('link', { name: 'stránce o nás' });
      await link.focus();
      await page.evaluate(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
      );
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      const button = (await back(page).boundingBox())!;
      await expect
        .poll(async () => (await link.boundingBox())!.y)
        .toBeGreaterThanOrEqual(button.y + button.height);
    });
  });
}
