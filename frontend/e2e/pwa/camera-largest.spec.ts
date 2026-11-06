import { LARGEST_RECEIPT, serveReceiptKeys, serveReceiptStatus } from '../receipt-verification';
import { expect, pwaTest as test } from './pwa-fixtures';

const PROOF_ADDRESS = 'https://nfnn.cz/overit#';

test.use({
  cameraShows: `${PROOF_ADDRESS}${LARGEST_RECEIPT.fragment}`,
  cameraFrame: { width: 1920, height: 1080, pixelsPerModule: 2 },
});

test.describe('Given a full HD fake camera that films the largest verification code, QR version 40 of a yearly receipt with 553 gifts, small in the middle of the frame at 2 px a module', () => {
  test('when the visitor scans with the camera on /overit, then the centre of the frame at its native resolution reads the whole code, which the scaled whole frame cannot, and the page verifies it', async ({
    page,
    context,
  }) => {
    await serveReceiptKeys(context);
    await serveReceiptStatus(context, 'active');
    await page.goto('/overit');

    await page.getByRole('button', { name: 'Naskenovat QR kód' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Podepsáno fondem Nová naděje',
      { timeout: 20_000 },
    );
    await expect(page.locator('video')).toHaveCount(0);
  });
});
