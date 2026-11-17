import { Locator, Page } from '@playwright/test';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';
import {
  serveReceiptKeys,
  serveReceiptStatus,
  verdictHeading,
  YEARLY_RECEIPT,
} from './receipt-verification';

const COMPUTER_WIDTHS = [900, 1024, 1280, 1440, 1599, 1600, 1920, 2560];
const FORMER_COLUMN_WIDTH = 912;
const PIXEL_TOLERANCE = 1;

async function leftEdge(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.x;
}

function backButton(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

for (const width of COMPUTER_WIDTHS) {
  test.describe(`Given a visitor on /overit in a window ${width} px wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockDonorApi(page);
    });

    test('when the page offers the three ways, then the title and the first way start on the header back button', async ({
      page,
    }) => {
      await page.goto('/overit');
      const firstWay = page.locator('.proof-ways > .ui-card').first();
      await expect(firstWay).toBeVisible();

      const axis = await leftEdge(backButton(page));
      const title = await leftEdge(page.getByRole('heading', { level: 1 }));

      expect(Math.abs(title - axis)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs((await leftEdge(firstWay)) - axis)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    });

    test('when a receipt is verified, then its result starts on the header back button and keeps its former width', async ({
      page,
    }) => {
      await serveReceiptKeys(page);
      await serveReceiptStatus(page, 'active');
      await page.goto(`/overit#${YEARLY_RECEIPT.fragment}`);
      const card = page.locator('.verify-card');
      await expect(verdictHeading(page)).toBeVisible();

      const axis = await leftEdge(backButton(page));
      const title = await leftEdge(page.getByRole('heading', { level: 1 }));
      const box = (await card.boundingBox())!;
      const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);

      expect(Math.abs(title - axis)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(Math.abs(box.x - axis)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
      expect(
        Math.abs(box.width - Math.min(FORMER_COLUMN_WIDTH, layoutWidth - 2 * axis)),
      ).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    });
  });
}
