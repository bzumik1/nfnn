import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

function colours(page: Page) {
  return page.evaluate(() => ({
    underPage: getComputedStyle(document.body).backgroundColor,
    footer: getComputedStyle(document.querySelector('app-site-footer footer')!).backgroundColor,
    content: getComputedStyle(document.querySelector('main')!).backgroundColor,
  }));
}

test.describe('Given a visitor on an iPhone, whose Safari paints the strip under its toolbar in the colour of the page body', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('when they scroll O nás to its dark footer, then that strip takes the footer colour, the content keeps its own, and back at the top the strip is light again', async ({
    page,
  }) => {
    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const atTop = await colours(page);

    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await colours(page)).underPage).toBe(atTop.footer);
    const atEnd = await colours(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

    expect(atTop.underPage).not.toBe(atTop.footer);
    expect(atEnd.content).toBe(atTop.underPage);
    await expect.poll(async () => (await colours(page)).underPage).toBe(atTop.underPage);
  });
});
