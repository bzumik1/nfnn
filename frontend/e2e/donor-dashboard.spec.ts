import { expect, test } from '@playwright/test';
import { noDonations, serveDonations, signIn } from './donor-session';

function donation(id: string, receivedAt: string, amountMinor: number, status = 'RECEIVED') {
  return {
    id,
    receiptNumber: null,
    receivedAt,
    amountMinor,
    currency: 'CZK',
    purpose: 'Obecný příspěvek',
    status,
    source: 'BANK_TRANSFER',
  };
}

const twoYears = {
  summary: {
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
    lastReceivedAt: '2026-03-15',
    byYear: [
      { year: 2026, count: 2, totalAmountMinor: 150000 },
      { year: 2025, count: 1, totalAmountMinor: 25000 },
    ],
  },
  list: {
    items: [
      donation('0192f0f1-0000-7000-8000-000000000004', '2026-03-15', 50000),
      donation('0192f0f1-0000-7000-8000-000000000003', '2026-01-10', 100000),
      donation('0192f0f1-0000-7000-8000-000000000002', '2025-11-05', 25000),
      donation('0192f0f1-0000-7000-8000-000000000001', '2025-08-20', 200000, 'REFUNDED'),
    ],
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
  },
};

test.describe('Given a signed-in donor', () => {
  test('when they have given in two years, then the dashboard shows their totals, their payments and each year on its own', async ({ page }) => {
    await serveDonations(page, twoYears);

    await signIn(page);

    await expect(page.locator('.stat-value')).toHaveText(['1 750 Kč', '3', '15. 03. 2026']);
    await expect(page.locator('.payments-card tbody tr')).toHaveCount(4);
    await expect(page.locator('.payments-card tbody tr').first().locator('td')).toHaveText([
      '15. 03. 2026',
      '500 Kč',
      'Obecný příspěvek',
      'Přijato',
      'Stáhnout PDF',
    ]);
    await expect(page.locator('.payments-card tbody tr').last()).toContainText('Vráceno');
    await expect(page.locator('.yearly-count')).toHaveText('2 příspěvky v roce 2026');
    await expect(page.locator('.yearly-total')).toHaveText('1 500 Kč celkem');

    await page.locator('.year-toggle').getByRole('button', { name: '2025' }).click();

    await expect(page.locator('.yearly-count')).toHaveText('1 příspěvek v roce 2025');
    await expect(page.locator('.yearly-total')).toHaveText('250 Kč celkem');
    await expect(page.locator('.yearly-pdf')).toHaveText('↓ PDF za rok 2025');
  });

  test('when no donation has arrived yet, then the dashboard shows zeros and explains how a gift appears', async ({ page }) => {
    await serveDonations(page, noDonations);

    await signIn(page);

    await expect(page.locator('.stat-value')).toHaveText(['0 Kč', '0', '—']);
    await expect(page.locator('.yearly-empty')).toHaveText(
      'Zatím jsme od vás žádný dar nepřijali. Jakmile dorazí platba s vaším variabilním symbolem, objeví se tady.',
    );
    await expect(page.locator('.year-toggle')).toHaveCount(0);
    await expect(page.locator('.yearly-pdf')).toHaveCount(0);
    await expect(page.locator('.payments-card table')).toHaveCount(0);
    await expect(page.locator('.payments-empty')).toHaveText('Zatím tu není žádná platba.');
    await expect(page.locator('.symbol-value')).toHaveText('1234567890');
  });
});
