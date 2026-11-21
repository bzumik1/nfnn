import { Locator, Page } from '@playwright/test';
import { mockDonorApi, openDonorSection } from './donor-session';
import { expect, test } from './fixtures';
import { donations as receiptDonations, openReceiptsAfterSignIn } from './receipt-donations';
import { RECEIPT_ISSUING_URL } from './receipt-issuing';

const YEARLY_PLACES = [
  {
    name: 'a year on Moje dary',
    section: 'Moje dary',
    row: (page: Page) => page.locator('.gift-year-head').last(),
  },
  {
    name: 'a year on Potvrzení o daru',
    section: 'Potvrzení o daru',
    row: (page: Page) => page.locator('.year-row').last(),
  },
];

async function placement(row: Locator, button: Locator): Promise<number[]> {
  const rowBox = (await row.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;
  return [rowBox.height, buttonBox.x, buttonBox.y, buttonBox.width].map((value) =>
    Math.round(value),
  );
}

test.describe('Given a donor on a phone 390 pt wide', () => {
  test.skip(
    ({ browserName }) => browserName !== 'webkit',
    'donor-dashboard.spec.ts runs this pose in Chromium with the other PDF places',
  );

  for (const place of YEARLY_PLACES) {
    test(`when the PDF of ${place.name} takes long to prepare, then its row keeps its height, the button stays put and Tab meets Zrušit after the button`, async ({
      page,
    }) => {
      await mockDonorApi(page, receiptDonations);
      const synced = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/donations/me/sync',
      );
      await page.route(
        (url) => url.pathname === RECEIPT_ISSUING_URL,
        () => new Promise<void>(() => undefined),
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await openReceiptsAfterSignIn(page);
      await openDonorSection(page, place.section);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('navigation', { name: 'Můj účet' })).toHaveCount(0);
      const row = place.row(page);
      const button = row.locator('.yearly-pdf');
      await expect(button).toBeVisible();
      await synced;
      await expect(page.locator('.first-sync')).toHaveCount(0);
      await expect(page.locator('.page-fade--leaving')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await expect(async () => {
        await button.evaluate((element) => element.scrollIntoView({ block: 'center' }));
        const centred = await page.evaluate(() => window.scrollY);
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        expect(await page.evaluate(() => window.scrollY)).toBe(centred);
      }).toPass();
      await page.clock.install();
      const resting = await placement(row, button);

      await button.click();
      const status = row.getByRole('status');
      await expect(status).toHaveText('Připravujeme údaje potvrzení…');
      expect(await placement(row, button)).toEqual(resting);

      await page.clock.fastForward(8000);
      const cancel = row.getByRole('button', { name: 'Zrušit' });
      await expect(cancel).toBeVisible();
      expect(await placement(row, button)).toEqual(resting);

      await button.focus();
      await page.keyboard.press('Tab');
      await expect(cancel).toBeFocused();
    });
  }
});
