import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, signIn } from './donor-session';

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c501',
  slug: 'dlouhy-clanek',
  title: 'Ohlédnutí za rokem',
  tag: 'Výroční ohlédnutí',
  perex: 'Co všechno se letos podařilo.',
  body: Array.from({ length: 30 }, (_, line) => `Odstavec číslo ${line + 1}.`).join('\n\n'),
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

async function scrollBy(page: Page, top: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), top);
}

async function articleServed(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
}

test.describe('Given a visitor on a computer, where nothing covers the top of the window', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('when an article scrolls past its title, then the edge shows no title, as the window has room for the page', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await articleServed(page);
    await page.goto(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();

    await scrollBy(page, 900);

    await expect(page.locator('.edge-title')).toHaveCount(0);
  });
});

test.describe('Given a visitor on a phone reading an article', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await articleServed(page);
    await page.goto(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
  });

  test('when its title scrolls away, then the title stands centred in the edge at the top, and goes when the title comes back', async ({
    page,
  }) => {
    const title = page.locator('.edge-title');
    await expect(title).toHaveCSS('opacity', '0');

    await scrollBy(page, 900);

    await expect(title).toHaveCSS('opacity', '1');
    await expect(title).toHaveText(article.title);
    await expect(title).toHaveAttribute('aria-hidden', 'true');
    const box = (await title.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - 390 / 2)).toBeLessThanOrEqual(1);
    const back = (await page.getByRole('button', { name: 'Zpět' }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(back.x + back.width);

    await scrollBy(page, 0);

    await expect(title).toHaveCSS('opacity', '0');
  });

  test('when the visitor asks for reduced motion, then the title appears without fading', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const duration = await page
      .locator('.edge-title')
      .evaluate((title) => parseFloat(getComputedStyle(title).transitionDuration));

    expect(duration).toBeLessThan(0.001);
  });
});

test.describe('Given a signed-in donor on a phone', () => {
  test('when a page of the account scrolls, then the account button stays beside the back button', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 500 });
    await expect(page.getByRole('button', { name: 'Zpět' })).toBeVisible();

    await scrollBy(page, 2000);

    const account = page.getByRole('banner').getByRole('button', { name: 'Účet' });
    await expect(account).toBeInViewport({ ratio: 1 });
    const accountBox = (await account.boundingBox())!;
    const backBox = (await page.getByRole('button', { name: 'Zpět' }).boundingBox())!;
    expect(Math.abs(accountBox.y - backBox.y)).toBeLessThanOrEqual(1);
  });
});
