import { Locator, Page } from '@playwright/test';
import { mockPublicContent, servePaymentDetails } from './baseline/screen-mocks';
import { expect, test } from './fixtures';

function bar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Hlavní sekce' });
}

function tab(page: Page, name: string): Locator {
  return bar(page).getByRole('link', { name, exact: true });
}

async function pillOffCentreOf(page: Page, name: string): Promise<number> {
  const pill = await bar(page).locator('.tab-bar-pill').boundingBox();
  const target = await tab(page, name).boundingBox();
  if (pill === null || target === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.hypot(
    pill.x + pill.width / 2 - (target.x + target.width / 2),
    pill.y + pill.height / 2 - (target.y + target.height / 2),
  );
}

test.describe('Given a visitor on a computer with the floating tab bar', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockPublicContent(page);
    await servePaymentDetails(page);
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
  });

  test('when the page opens, then the pill rests on the current tab', async ({ page }) => {
    await expect(bar(page).locator('.tab-bar-pill')).toBeVisible();
    await expect.poll(() => pillOffCentreOf(page, 'O nás')).toBeLessThan(1);
  });

  test('when another tab is clicked, then the pill ends on that tab', async ({ page }) => {
    await tab(page, 'Přispět').click();

    await expect(tab(page, 'Přispět')).toHaveAttribute('aria-current', 'page');
    await expect(bar(page).locator('.tab-bar-pill')).toBeVisible();
    await expect.poll(() => pillOffCentreOf(page, 'Přispět')).toBeLessThan(1);
  });

  test('when the route changes without the tab bar, then the pill follows to the new tab', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Přispět' }).first().click();

    await expect(tab(page, 'Přispět')).toHaveAttribute('aria-current', 'page');
    await expect(bar(page).locator('.tab-bar-pill')).toBeVisible();
    await expect.poll(() => pillOffCentreOf(page, 'Přispět')).toBeLessThan(1);
  });

  test('when the landing page is open, then no pill shows', async ({ page }) => {
    await page.goto('/');

    await expect(tab(page, 'O nás')).not.toHaveAttribute('aria-current', /.+/);
    await expect(bar(page).locator('.tab-bar-pill')).toBeHidden();
  });
});
