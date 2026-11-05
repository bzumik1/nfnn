import { SINGLE_RECEIPT, serveReceiptKeys, serveReceiptStatus } from '../receipt-verification';
import { expect, pwaTest as test } from './pwa-fixtures';

const PROOF_ADDRESS = 'https://nfnn.cz/overit#';

test.use({ cameraShows: `${PROOF_ADDRESS}${SINGLE_RECEIPT.fragment}` });

test.describe('Given a fake camera that films the verification QR code of a receipt', () => {
  test('when the visitor scans with the camera on /overit, then the real camera pipeline reads the code and the page verifies it', async ({
    page,
    context,
  }) => {
    await serveReceiptKeys(context);
    await serveReceiptStatus(context, 'active');
    await page.goto('/overit');

    await page.getByRole('button', { name: 'Naskenovat QR kód' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Podepsáno fondem Nová naděje',
    );
    await expect(page.locator('video')).toHaveCount(0);
  });
});
