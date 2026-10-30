import { DonationItem, DonationListResponse, DonationSummaryResponse } from '../donations-api';

export function donationItem(overrides: Partial<DonationItem> = {}): DonationItem {
  return {
    id: '0192f0f1-0000-7000-8000-000000000001',
    receiptNumber: null,
    receivedAt: '2026-03-15',
    amountMinor: 50000,
    currency: 'CZK',
    purpose: 'Obecný příspěvek',
    status: 'RECEIVED',
    source: 'BANK_TRANSFER',
    pairedBy: 'VARIABLE_SYMBOL',
    senderAccount: null,
    confirmedSymbol: null,
    accountVerification: false,
    receiptAvailable: true,
    ...overrides,
  };
}

export function accountVerificationItem(overrides: Partial<DonationItem> = {}): DonationItem {
  return donationItem({
    id: '0192f0f1-0000-7000-8000-0000000000a1',
    amountMinor: 100,
    purpose: 'Ověření účtu',
    accountVerification: true,
    receiptAvailable: false,
    ...overrides,
  });
}

export function twoYearDonations(): DonationListResponse {
  return {
    items: [
      donationItem({ id: 'd-4', receivedAt: '2026-03-15', amountMinor: 50000 }),
      donationItem({
        id: 'd-3',
        receivedAt: '2026-01-10',
        amountMinor: 100000,
        receiptNumber: '2026-000017',
      }),
      donationItem({ id: 'd-2', receivedAt: '2025-11-05', amountMinor: 25000 }),
      donationItem({
        id: 'd-1',
        receivedAt: '2025-08-20',
        amountMinor: 200000,
        status: 'REFUNDED',
        receiptAvailable: false,
      }),
    ],
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
  };
}

export function twoYearSummary(): DonationSummaryResponse {
  return {
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
    lastReceivedAt: '2026-03-15',
    byYear: [
      { year: 2026, count: 2, totalAmountMinor: 150000 },
      { year: 2025, count: 1, totalAmountMinor: 25000 },
    ],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2025,
  };
}

export function emptyDonations(): DonationListResponse {
  return { items: [], totalAmountMinor: 0, currency: 'CZK', count: 0 };
}

export function emptySummary(): DonationSummaryResponse {
  return {
    totalAmountMinor: 0,
    currency: 'CZK',
    count: 0,
    lastReceivedAt: null,
    byYear: [],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2025,
  };
}
