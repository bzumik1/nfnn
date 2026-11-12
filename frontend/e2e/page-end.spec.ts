import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

function colours(page: Page) {
  return page.evaluate(() => ({
    underPage: getComputedStyle(document.body).backgroundColor,
    contact: getComputedStyle(document.querySelector('#kontakt')!).backgroundColor,
  }));
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test.describe(`Given a visitor ${viewport.width} px wide, whose Safari paints the strip under its toolbar in the colour of the page body`, () => {
    test.use({ viewport });

    test('when they scroll O nás to its dark contact section, then that strip takes the colour of the section, the page ends without a footer, and back at the top the strip is light again', async ({
      page,
    }) => {
      await page.goto('/o-nas');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const atTop = await colours(page);

      await page.evaluate(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
      );
      await expect.poll(async () => (await colours(page)).underPage).toBe(atTop.contact);
      await expect(page.getByRole('contentinfo')).toHaveCount(0);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

      expect(atTop.underPage).not.toBe(atTop.contact);
      await expect.poll(async () => (await colours(page)).underPage).toBe(atTop.underPage);
    });

    test('when they leave the end of O nás for another tab, then that strip is light again', async ({
      page,
    }) => {
      await page.goto('/o-nas');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const atTop = await colours(page);
      await page.evaluate(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
      );
      await expect.poll(async () => (await colours(page)).underPage).toBe(atTop.contact);

      await page
        .getByRole('navigation', { name: 'Hlavní sekce' })
        .getByRole('link', { name: 'Aktuality' })
        .click();
      await expect(page).toHaveURL(/\/aktuality$/);

      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe(atTop.underPage);
    });
  });
}
