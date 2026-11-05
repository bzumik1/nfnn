import { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readPdf } from '../src/app/features/donations/receipt-pdf/testing/pdf-reader';
import { administrator, mockDonorApi, session } from './donor-session';
import { expect, test } from './fixtures';
import { syntheticPortrait, syntheticSignature } from './receipt-issuing';
import { donorIdOf, FOUR_DONORS, mockYearlyReceipts, receiptNumberOf } from './yearly-receipts';

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

const DRAWING_60_RECEIPTS_MS = 20_000;

test.describe('Given an administrator who prints the yearly receipts of 2026', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they issue every receipt of the year for two-sided printing, then one PDF holds each receipt on its own sheet and the result names the replaced and skipped ones', async ({
    page,
  }) => {
    const calls = await mockYearlyReceipts(page, { donors: FOUR_DONORS, withArt: true });

    await page.goto('/sprava/hromadna-potvrzeni');
    await expect(page).toHaveTitle('Hromadná potvrzení | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Hromadná potvrzení' })).toBeFocused();
    await expect(page.getByLabel('Rok', { exact: true })).toHaveValue(/2026/);
    await expect(page.locator('.donors-table tbody tr td:first-child')).toHaveText([
      'Adámek Jan',
      'Bílá Eva',
      'Čermák Petr',
      'Dvořák Ota',
    ]);

    await expect(page.getByLabel(/^Tisknu oboustranně/)).toBeChecked();
    await page.getByRole('button', { name: 'Vystavit a připravit PDF k tisku' }).click();

    await expect(page.locator('app-live-notice').getByRole('status')).toHaveText(
      'PDF k tisku je připravené: obsahuje 3 potvrzení.',
    );
    expect(calls.posted).toEqual([[3, 1, 2, 0].map(donorIdOf)]);
    expect(calls.images.sort()).toEqual(
      [syntheticSignature.sha256, syntheticPortrait.sha256].sort(),
    );
    await expect(page.locator('.replaced li')).toHaveText([
      `Bílá Eva: ${receiptNumberOf(1)} nahrazuje 2027-000090`,
    ]);
    await expect(page.locator('.skipped li')).toHaveText([
      'Čermák Petr: dárce dnes dosáhl denního limitu nových potvrzení; zkuste to zítra.',
    ]);

    const [saved] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Stáhnout PDF' }).click(),
    ]);
    expect(saved.suggestedFilename()).toBe('potvrzeni-o-darech-2026-hromadne.pdf');
    const pdf = await readPdf(new Uint8Array(await readFile(await saved.path())));
    const starts = [receiptNumberOf(3), receiptNumberOf(1), receiptNumberOf(0)].map((number) =>
      pdf.pages.findIndex((pdfPage) => pdfPage.text.includes(number)),
    );
    expect(starts).toEqual([0, 2, 4]);
    expect(pdf.pages).toHaveLength(5);
    expect(pdf.pages[1].text).toBe('');
    expect(pdf.raw.match(/\/Subtype \/Image/g) ?? []).toHaveLength(1);

    const requested: string[] = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) {
        requested.push(request.url());
      }
    });
    const [again] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Stáhnout znovu' }).click(),
    ]);
    expect(again.suggestedFilename()).toBe('potvrzeni-o-darech-2026-hromadne.pdf');
    expect(requested).toEqual([]);
  });

  test('when the server stops in the middle, then the alert offers to try again and the next try sends only the donors left', async ({
    page,
  }) => {
    const donors = Array.from({ length: 60 }, (_, index) => ({
      name: `Dárce ${String(index).padStart(2, '0')}`,
    }));
    await mockYearlyReceipts(page, { donors });
    const posted: number[] = [];
    let refuse = true;
    await page.route(
      (url) => url.pathname === '/api/admin/donations/receipts/yearly',
      async (route) => {
        if (route.request().method() !== 'POST') {
          return route.fallback();
        }
        const body = route.request().postDataJSON() as { donorIds: string[] };
        posted.push(body.donorIds.length);
        if (posted.length === 2 && refuse) {
          refuse = false;
          return route.fulfill({ status: 503, body: '' });
        }
        return route.fallback();
      },
    );

    await page.goto('/sprava/hromadna-potvrzeni');
    await page.getByLabel(/^Tisknu oboustranně/).uncheck();
    await page.getByRole('button', { name: 'Vystavit a připravit PDF k tisku' }).click();
    const alert = page.locator('.failure');
    await expect(alert).toContainText('Vystavování potvrzení se přerušilo.');
    await expect(alert).toBeFocused();

    await alert.getByRole('button', { name: 'Zkusit znovu' }).click();
    await expect(page.locator('app-live-notice').getByRole('status')).toHaveText(
      'PDF k tisku je připravené: obsahuje 60 potvrzení.',
      { timeout: DRAWING_60_RECEIPTS_MS },
    );
    expect(posted).toEqual([50, 10, 10]);
  });
});
