import { DonationItem, DonationSummaryResponse } from '../../donations/donations-api';
import { IssuedReceipt } from '../../donations/receipt-pdf/frozen-receipt';

export type YearReceipt = 'available' | 'after-year-end' | 'not-issued';

export function yearReceipt(year: number, summary: DonationSummaryResponse): YearReceipt {
  if (year < summary.receiptsAvailableFrom) {
    return 'not-issued';
  }
  return year > summary.yearlyReceiptsAvailableThrough ? 'after-year-end' : 'available';
}

export function giftsOnActiveYearlyReceipts(
  items: readonly DonationItem[],
  receipts: readonly IssuedReceipt[],
): ReadonlySet<string> {
  const onReceipt = new Set<string>();
  for (const receipt of receipts) {
    const gifts = receipt.receipt?.gifts;
    if (
      receipt.kind !== 'YEARLY' ||
      receipt.status !== 'ACTIVE' ||
      receipt.year === null ||
      !Array.isArray(gifts)
    ) {
      continue;
    }
    const listed = new Map<string, number>();
    for (const gift of gifts) {
      const key = giftKey(gift.receivedOn, gift.amountMinor);
      listed.set(key, (listed.get(key) ?? 0) + 1);
    }
    for (const item of items) {
      const key = giftKey(item.receivedAt, item.amountMinor);
      const left = listed.get(key) ?? 0;
      if (
        item.status === 'RECEIVED' &&
        item.receivedAt.startsWith(`${receipt.year}-`) &&
        left > 0
      ) {
        listed.set(key, left - 1);
        onReceipt.add(item.id);
      }
    }
  }
  return onReceipt;
}

function giftKey(receivedOn: string, amountMinor: number): string {
  return `${receivedOn}|${amountMinor}`;
}
