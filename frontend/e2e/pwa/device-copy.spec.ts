import {
  donationItem,
  donorSyncOf,
  mockDonorApi,
  mockDonorSync,
  openAccountItem,
  openDonorSection,
  openSignInDialog,
  session,
} from '../donor-session';
import { donations as twoGifts } from '../receipt-donations';
import { expect, type IdbDump, pwaTest as test } from './pwa-fixtures';

const DEVICE_DATABASE = 'nfnn.device';

function wrapsOf(dump: IdbDump): string[] {
  const copies = (dump[DEVICE_DATABASE]?.['copies'] ?? []) as { wraps?: { kind: string }[] }[];
  return copies.flatMap((copy) => (copy.wraps ?? []).map((wrap) => wrap.kind)).sort();
}

test.describe('Given a donor who signs in with a password to the site behind its production nginx', () => {
  test.use({
    allowedConsoleErrors: [
      /status of 503 \(Service Unavailable\) \(http:\/\/localhost:\d+\/api\/donations\/me(\/summary)?\)$/,
    ],
  });

  test('when she signs in, then the Argon2id worker wraps her copy under the real policy, and after a reload her gifts show from the copy before the sync answers, which then brings her new gift, at once or behind Zobrazit 1 nový dar', async ({
    page,
    context,
    idbDump,
  }) => {
    await mockDonorApi(context, {
      ...twoGifts,
      sync: await donorSyncOf(twoGifts.summary, { gifts: twoGifts.list.items }),
    });
    await context.route('**/api/donors/auth/login', (route) => route.fulfill(session(200)));
    await context.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await context.route(
      (url) => url.pathname === '/api/live',
      (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: '' }),
    );
    const gifts = page.locator('.payments-card tbody tr');

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openAccountItem(page, 'Můj přehled');
    await expect(page).toHaveURL(/\/darce\/prehled$/);
    await openDonorSection(page, 'Moje dary');
    await expect(gifts).toHaveCount(2);
    await expect.poll(async () => wrapsOf(await idbDump())).toEqual(['password', 'session']);

    const newGift = donationItem({
      id: '0192f0f1-0000-7000-8000-000000000003',
      receivedAt: '2026-04-02',
      amountMinor: 30000,
    });
    await context.route(
      (url) => url.pathname === '/api/donations/me' || url.pathname === '/api/donations/me/summary',
      (route) => route.fulfill({ status: 503, body: '' }),
    );
    await mockDonorSync(
      context,
      await donorSyncOf(
        {
          ...twoGifts.summary,
          count: 3,
          totalAmountMinor: 105000,
          lastReceivedAt: '2026-04-02',
          byYear: [{ year: 2026, count: 2, totalAmountMinor: 80000 }, twoGifts.summary.byYear[1]],
        },
        { gifts: [newGift, ...twoGifts.list.items] },
      ),
    );
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await context.route(
      (url) => url.pathname === '/api/donations/me/sync',
      async (route) => {
        await held;
        await route.fallback();
      },
    );

    await page.reload();

    await expect(gifts).toHaveCount(2);
    release();
    const pill = page.locator('.bank-check-incoming').filter({ hasText: 'Zobrazit 1 nový dar' });
    await expect(pill.or(gifts.nth(2))).toBeVisible();
    if (await pill.isVisible()) {
      await pill.click();
    }
    await expect(gifts).toHaveCount(3);
    await expect(gifts.first()).toContainText('300 Kč');
  });
});
