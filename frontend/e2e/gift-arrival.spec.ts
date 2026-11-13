import { Page } from '@playwright/test';
import { leaveAccountForSite, openSection, signIn } from './donor-session';
import { expect, test } from './fixtures';
import { GIFT_THANKS, giftArrivesAfterSavingQr, serveGifts } from './gift-arrival';

function thanks(page: Page) {
  return page.locator('.gift-arrival [role="status"]');
}

test.describe('Given a signed-in donor paying from Přispět', () => {
  test('when the donor saves the QR code and the live stream tells of the gift, then the page thanks with its amount without asking the bank, links to the overview and Zavřít closes the thanks', async ({
    page,
  }) => {
    const { gifts, checksBeforeIntent } = await giftArrivesAfterSavingQr(page);

    await expect(page.getByRole('link', { name: 'Zobrazit v přehledu' })).toHaveAttribute(
      'href',
      '/darce/prehled',
    );
    expect(gifts.bankChecks()).toBe(checksBeforeIntent);

    await page.getByRole('button', { name: 'Zavřít' }).click();
    await expect(thanks(page)).toHaveText('');
    await expect(page.getByRole('link', { name: 'Zobrazit v přehledu' })).toHaveCount(0);
  });

  test('when no live stream is open, then the page asks the bank 30 s after the intent and thanks once the gift is read', async ({
    page,
  }) => {
    await page.clock.install();
    const gifts = await serveGifts(page);
    await signIn(page);
    await leaveAccountForSite(page);
    await openSection(page, 'Přispět');
    await expect(page.getByRole('img', { name: /QR platba/ })).toBeVisible();
    const checksOnPrispet = gifts.bankChecks();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Uložit QR kód' }).click();
    await download;
    gifts.arrive();

    await page.clock.fastForward(30_000);

    await expect.poll(() => gifts.bankChecks()).toBe(checksOnPrispet + 1);
    await expect(thanks(page)).toHaveText(GIFT_THANKS);
  });
});
