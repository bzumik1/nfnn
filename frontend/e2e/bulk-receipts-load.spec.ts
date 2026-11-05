import { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readPdf } from '../src/app/features/donations/receipt-pdf/testing/pdf-reader';
import { administrator, mockDonorApi, session } from './donor-session';
import { expect, test } from './fixtures';
import { mockYearlyReceipts } from './yearly-receipts';

const RECEIPTS = 300;
const CPU_SLOWDOWN = 4;
const BULK_RECEIPTS_BUDGET_MS = 180_000;

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given a year of 300 donors on a slow device', () => {
  test.skip(!process.env['BULK_RECEIPTS_LOAD'], 'the nightly measurement (BULK_RECEIPTS_LOAD=1)');
  test.skip(({ browserName }) => browserName !== 'chromium', 'CPU throttling needs Chromium');

  test('when every receipt is issued and drawn at a quarter of the CPU, then the PDF holds them all within the budget', async ({
    page,
  }) => {
    test.setTimeout(BULK_RECEIPTS_BUDGET_MS + 120_000);
    await mockDonorApi(page);
    await mockYearlyReceipts(page, {
      donors: Array.from({ length: RECEIPTS }, (_, index) => ({
        name: `Dárce ${String(index + 1).padStart(3, '0')}`,
      })),
      withArt: true,
    });
    await rememberedSession(page);
    await page.goto('/sprava/hromadna-potvrzeni');
    await expect(page.locator('.donors-table tbody tr')).toHaveCount(RECEIPTS);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

    const started = Date.now();
    await page.getByRole('button', { name: 'Vystavit a připravit PDF k tisku' }).click();
    await expect(page.locator('app-live-notice').getByRole('status')).toHaveText(
      `PDF k tisku je připravené: obsahuje ${RECEIPTS} potvrzení.`,
      { timeout: BULK_RECEIPTS_BUDGET_MS },
    );
    const elapsed = Date.now() - started;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    test.info().annotations.push({
      type: 'measured',
      description: `${RECEIPTS} receipts at ${CPU_SLOWDOWN}× CPU slowdown: ${elapsed} ms`,
    });
    console.log(`bulk receipts: ${RECEIPTS} receipts at ${CPU_SLOWDOWN}× CPU: ${elapsed} ms`);

    const [saved] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Stáhnout PDF' }).click(),
    ]);
    const pdf = await readPdf(new Uint8Array(await readFile(await saved.path())));
    expect(pdf.pages).toHaveLength(RECEIPTS);
    expect(pdf.raw.match(/\/Subtype \/Image/g) ?? []).toHaveLength(1);
    expect(elapsed).toBeLessThan(BULK_RECEIPTS_BUDGET_MS);
  });
});
