import { Page } from '@playwright/test';
import {
  donationItem,
  DonorSyncMock,
  donorSyncOf,
  leaveAccountForSite,
  mockDonorApi,
  noDonations,
  openSection,
  signIn,
} from './donor-session';
import { expect } from './fixtures';

const EARLIER_GIFT = donationItem({
  id: '0192f0f1-0000-7000-8000-000000000001',
  receivedAt: '2026-03-15',
  amountMinor: 20000,
});
const NEW_GIFT = donationItem({
  id: '0192f0f1-0000-7000-8000-000000000002',
  receivedAt: '2026-11-06',
  amountMinor: 50000,
});
export const GIFT_THANKS = 'Váš dar 500 Kč dorazil. Děkujeme!';

export interface GiftsOnTheirWay {
  arrive(): void;
  bankChecks(): number;
}

function summaryOf(gifts: readonly ReturnType<typeof donationItem>[]) {
  const total = gifts.reduce((sum, gift) => sum + (gift.amountMinor as number), 0);
  return {
    ...noDonations.summary,
    totalAmountMinor: total,
    count: gifts.length,
    lastReceivedAt: gifts.at(-1)?.receivedAt ?? null,
    byYear: [{ year: 2026, count: gifts.length, totalAmountMinor: total }],
  };
}

function listOf(gifts: readonly ReturnType<typeof donationItem>[]) {
  return {
    items: [...gifts].reverse(),
    totalAmountMinor: summaryOf(gifts).totalAmountMinor,
    currency: 'CZK',
    count: gifts.length,
  };
}

export async function serveGifts(page: Page): Promise<GiftsOnTheirWay> {
  let arrived = false;
  let bankChecks = 0;
  const before = [EARLIER_GIFT];
  const after = [EARLIER_GIFT, NEW_GIFT];
  const syncBefore = await donorSyncOf(summaryOf(before), { gifts: before });
  const syncAfter = await donorSyncOf(summaryOf(after), { gifts: after });
  const sync = (): DonorSyncMock => (arrived ? syncAfter : syncBefore);
  await mockDonorApi(page, { summary: summaryOf(before), list: listOf(before), sync: syncBefore });
  await page.route(
    (url) => url.pathname === '/api/donations/me/summary',
    (route) => route.fulfill({ json: summaryOf(arrived ? after : before) }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me',
    (route) => route.fulfill({ json: listOf(arrived ? after : before) }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me/sync',
    (route) =>
      route.fulfill({
        json: {
          subject: 'donor-jana',
          summary: sync().summary,
          chunks: sync().chunks.map(({ id, rowsSha256, count }) => ({ id, rowsSha256, count })),
        },
      }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me/sync/chunks',
    (route) => {
      const asked = (new URL(route.request().url()).searchParams.get('ids') ?? '').split(',');
      return route.fulfill({
        json: {
          subject: 'donor-jana',
          summary: sync().summary,
          chunks: sync().chunks.filter((chunk) => asked.includes(chunk.id)),
          missing: asked.filter((id) => !sync().chunks.some((chunk) => chunk.id === id)),
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-check',
    (route) => {
      if (route.request().method() === 'POST') {
        bankChecks++;
      }
      return route.fulfill({
        status: route.request().method() === 'POST' ? 202 : 200,
        json: { bankDataAsOf: '2026-11-06T10:00:00Z', checking: false },
      });
    },
  );
  return {
    arrive: () => (arrived = true),
    bankChecks: () => bankChecks,
  };
}

export async function holdLiveStream(page: Page): Promise<() => void> {
  let announce: () => void = () => undefined;
  const announced = new Promise<void>((resolve) => (announce = resolve));
  await page.route(
    (url) => url.pathname === '/api/live',
    async (route) => {
      await announced;
      await route
        .fulfill({
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-store' },
          body: 'event:revision\ndata:{"revision":"e2e"}\n\nevent:changed\ndata:{"feed":"donations"}\n\n',
        })
        .catch(() => undefined);
    },
  );
  return announce;
}

export interface ThankedGift {
  readonly gifts: GiftsOnTheirWay;
  readonly checksBeforeIntent: number;
}

export async function giftArrivesAfterSavingQr(page: Page): Promise<ThankedGift> {
  const gifts = await serveGifts(page);
  const announce = await holdLiveStream(page);
  await signIn(page);
  await leaveAccountForSite(page);
  await openSection(page, 'Přispět');
  await expect(page.getByRole('img', { name: /QR platba/ })).toBeVisible();
  const checksBeforeIntent = gifts.bankChecks();
  const streamOpened = page.waitForRequest((request) => request.url().endsWith('/api/live'));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Uložit QR kód' }).click();
  await download;
  await streamOpened;
  gifts.arrive();
  announce();
  await expect(page.locator('.gift-arrival [role="status"]')).toHaveText(GIFT_THANKS);
  return { gifts, checksBeforeIntent };
}
