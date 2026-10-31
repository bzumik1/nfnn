import { Page } from '@playwright/test';
import { donationItem, donor, session } from './donor-session';
import { expect } from './fixtures';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

export const ISSUING = { singleNumber: '2026-000001' };

export const donations = {
  summary: {
    totalAmountMinor: 75000,
    currency: 'CZK',
    count: 2,
    lastReceivedAt: '2026-03-15',
    byYear: [
      { year: 2026, count: 1, totalAmountMinor: 50000 },
      { year: 2025, count: 1, totalAmountMinor: 25000 },
    ],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2025,
  },
  list: {
    items: [
      donationItem({ id: '0192f0f1-0000-7000-8000-000000000002', receivedAt: '2026-03-15' }),
      donationItem({
        id: '0192f0f1-0000-7000-8000-000000000001',
        receivedAt: '2025-11-05',
        amountMinor: 25000,
      }),
    ],
    totalAmountMinor: 75000,
    currency: 'CZK',
    count: 2,
  },
};

export const yearlyButton = (page: Page) => page.locator('.yearly-pdf');
export const yearlyLine = (page: Page) => page.locator('.year-row .download-progress-line');

export async function openReceiptsAfterSignIn(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200, donor)));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
  await page.goto('/darce/potvrzeni');
  await expect(yearlyButton(page)).toBeVisible();
}

export async function pretendIphoneThatShares(page: Page): Promise<void> {
  await page.addInitScript((userAgent) => {
    const shared: string[] = [];
    Object.assign(window, { sharedFiles: shared });
    Object.defineProperty(navigator, 'userAgent', { value: userAgent });
    Object.defineProperty(navigator, 'canShare', {
      value: (data: ShareData) => (data.files?.length ?? 0) > 0,
    });
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        shared.push(...(data.files ?? []).map((file) => `${file.name} ${file.type}`));
      },
    });
  }, IPHONE);
}

export async function sharedFiles(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { sharedFiles: string[] }).sharedFiles);
}
