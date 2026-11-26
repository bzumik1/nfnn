import { expect, test } from './fixtures';
import { mockDonorApi, openAccountItem, signIn } from './donor-session';
import { untilAtRest } from './motion-frames';

test.describe('Given a signed-in donor on a 375 px touch phone', () => {
  test.use({ hasTouch: true });

  test('when Přidat bankovní účet opens with its QR code, then nothing in the sheet reaches past its sides, so it never scrolls sideways', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await openAccountItem(page, 'Bankovní účty');
    await page.getByRole('button', { name: 'Přidat bankovní účet' }).click();
    const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
    await expect(dialog.locator('.add-account-bank')).toBeVisible();
    await expect(dialog.locator('.add-account-qr app-qr-code')).toBeVisible();
    await untilAtRest(dialog.locator('.add-account-bank'));

    expect(
      await dialog.evaluate((element) =>
        [element, ...element.querySelectorAll<HTMLElement>('.dialog-panel, .dialog-body')]
          .filter((scroller) => scroller.scrollWidth > scroller.clientWidth)
          .map(
            (scroller) =>
              `${scroller.className}: ${scroller.scrollWidth} > ${scroller.clientWidth}`,
          ),
      ),
    ).toEqual([]);
  });
});
