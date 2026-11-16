import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';

const STATUS_BAR = 62;
const WIDTH = 390;
const TOP_STRIP = 160;

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c701',
  slug: 'dlouhy-clanek',
  title: 'Ohlédnutí za rokem',
  tag: 'Výroční ohlédnutí',
  perex: 'Co všechno se letos podařilo.',
  body: Array.from(
    { length: 30 },
    (_, line) =>
      `Odstavec číslo ${line + 1}: díky vašim darům jsme letos mohli pomoci dětem, které potřebují rehabilitaci.`,
  ).join('\n\n'),
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

async function underTheStatusBar(page: Page): Promise<void> {
  await page.addStyleTag({ content: `:root { --safe-area-top: ${STATUS_BAR}px !important; }` });
}

async function topStrip(page: Page): Promise<Buffer> {
  return page.screenshot({
    clip: { x: 0, y: 0, width: WIDTH, height: TOP_STRIP },
    animations: 'disabled',
  });
}

async function topStripWithoutTheHeader(page: Page): Promise<Buffer> {
  await page.addStyleTag({ content: 'header.app-header { display: none !important; }' });
  return topStrip(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Given an iPhone in the ${colorScheme} appearance whose status bar takes the top ${STATUS_BAR} px`, () => {
    test.use({ viewport: { width: WIDTH, height: 844 }, colorScheme, reducedMotion: 'reduce' });

    test('when a tab root scrolls its content under the clock, then nothing is drawn over the content at the top: no band, no blur and no fade', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.goto('/o-nas');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await underTheStatusBar(page);

      await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));

      const shown = await topStrip(page);
      expect(shown.equals(await topStripWithoutTheHeader(page))).toBe(true);
    });

    test('when an article scrolls its text under the back button, then nothing but the controls is drawn over the text at the top', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === `/api/content/news/${article.slug}`,
        (route) => route.fulfill({ json: article }),
      );
      await page.goto(`/aktuality/${article.slug}`);
      await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
      await underTheStatusBar(page);
      await page.addStyleTag({
        content:
          '.back-button, .account-button, .sign-in, .edge-title { visibility: hidden !important; }',
      });

      await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));

      const shown = await topStrip(page);
      expect(shown.equals(await topStripWithoutTheHeader(page))).toBe(true);
    });
  });
}
