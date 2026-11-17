import { Page } from '@playwright/test';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';

const WIDTHS = [1600, 1920];
const PIXEL_TOLERANCE = 1;

async function largestGapInPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.width = 'var(--space-20)';
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
}

for (const width of WIDTHS) {
  test.describe(`Given a visitor reading the privacy policy in a window ${width} px wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockDonorApi(page);
    });

    test('when the page shows its contents beside the text, then the gap between them is at most --space-20 and the text keeps its measure', async ({
      page,
    }) => {
      await page.goto('/zasady-ochrany-osobnich-udaju');
      const contents = page.getByRole('navigation', { name: 'Obsah' });
      const text = page.locator('.prose');
      await expect(contents).toBeVisible();

      const textBox = (await text.boundingBox())!;
      const contentsBox = (await contents.boundingBox())!;
      const measure = await text.evaluate((element) =>
        parseFloat(getComputedStyle(element).maxWidth),
      );
      const gap = contentsBox.x - (textBox.x + textBox.width);

      expect(gap).toBeLessThanOrEqual((await largestGapInPixels(page)) + PIXEL_TOLERANCE);
      expect(textBox.width).toBeLessThanOrEqual(measure + PIXEL_TOLERANCE);
    });
  });
}
