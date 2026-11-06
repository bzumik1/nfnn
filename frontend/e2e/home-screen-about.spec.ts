import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockPublicContent } from './baseline/screen-mocks';

async function openedFromHomeScreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
  });
}

function foundation(page: Page) {
  return page.getByRole('navigation', { name: 'O nadačním fondu' });
}

test.describe('Given the app opened from the home screen of an iPhone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPublicContent(page);
    await openedFromHomeScreen(page);
    await page.goto('/o-nas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('when O nás is read to its end, then rows of the foundation close it instead of the web footer', async ({
    page,
  }) => {
    await foundation(page).scrollIntoViewIfNeeded();

    await expect(page.getByRole('contentinfo')).toHaveCount(0);
    await expect(
      foundation(page).getByRole('link', { name: 'Napsat na info@nfnn.cz' }),
    ).toHaveAttribute('href', 'mailto:info@nfnn.cz');
    await expect(page.getByText(/IČO 27278794 · zapsán u KS Ústí nad Labem/)).toBeVisible();
  });

  test('when the privacy row is tapped, then the privacy policy opens', async ({ page }) => {
    await foundation(page).getByRole('link', { name: 'Zásady ochrany osobních údajů' }).click();

    await expect(page).toHaveURL('/zasady-ochrany-osobnich-udaju');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('Given the site in a tab of the browser on a phone', () => {
  test('when O nás is read to its end, then the web footer still closes it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPublicContent(page);
    await page.goto('/o-nas');

    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(foundation(page)).toHaveCount(0);
  });
});
