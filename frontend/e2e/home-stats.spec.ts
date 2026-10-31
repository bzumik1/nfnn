import { expect, test } from './fixtures';

test.describe('Given a visitor on the home page', () => {
  test('when the figures scroll into view, then they count up from zero to their values', async ({
    page,
  }) => {
    await page.goto('/');
    const figures = page.locator('app-stats-bar [aria-hidden="true"]');
    await expect(figures).toHaveText(['0', '0+', '0%', '2005']);

    await page.locator('app-stats-bar').scrollIntoViewIfNeeded();

    await expect(figures.nth(1)).not.toHaveText('0+');
    await expect(figures.nth(1)).toHaveText('200+');
    await expect(figures).toHaveText([/^\d+$/, '200+', '100%', '2005']);
    await expect(page.locator('app-stats-bar .stat').first()).toHaveCSS('opacity', '1');
  });

  test('when the figures have not been seen yet, then a screen reader still reads the final ones', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('app-stats-bar')).toMatchAriaSnapshot(
      '- text: /\\d+ let pomáháme 200\\+ podpořených dětí 100% transparentně 2005 rok vzniku/',
    );
  });
});

test.describe('Given a visitor who asks for reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('when the home page opens, then the figures stand at their values without counting', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('app-stats-bar [aria-hidden="true"]')).toHaveText([
      /^\d+$/,
      '200+',
      '100%',
      '2005',
    ]);
  });
});
