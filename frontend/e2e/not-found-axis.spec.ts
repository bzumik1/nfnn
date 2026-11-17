import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';

const WIDTHS = [1280, 1600, 1920, 2560];
const PIXEL_TOLERANCE = 1;

for (const width of WIDTHS) {
  test.describe(`Given the page of a missing address in a window ${width} px wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockDonorApi(page);
    });

    test('when it opens, then its title and its first button start on the line of the logo', async ({
      page,
    }) => {
      await page.goto('/neexistuje');
      const title = page.getByRole('heading', { level: 1 });
      const firstButton = page.getByRole('main').locator('.ui-cta').first();
      await expect(firstButton).toBeVisible();

      const logo = (await page.locator('app-header .brand img').boundingBox())!;
      const titleBox = (await title.boundingBox())!;
      const buttonBox = (await firstButton.boundingBox())!;

      expect(Math.abs(titleBox.x - logo.x)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs(buttonBox.x - logo.x)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    });
  });
}
