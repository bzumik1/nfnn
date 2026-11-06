import type { SignedReceipt } from '../../../donations/verification/receipt-proof';
import type { AdminReceiptRow } from '../receipt-register';

export const SIGNED_YEARLY: SignedReceipt = {
  kind: 'yearly',
  number: '2026-000007',
  issuedOn: '2027-01-05',
  year: 2026,
  replaces: null,
  donor: {
    type: 'person',
    name: 'Jana Vzorová',
    street: 'Hlavní 1',
    city: 'Praha',
    postalCode: '110 00',
    companyIdentifier: null,
  },
  gifts: [
    { receivedOn: '2026-03-01', amountMinor: 50_000 },
    { receivedOn: '2026-04-01', amountMinor: 70_000 },
  ],
  totalMinor: 120_000,
};

export function receiptRow(overrides: Partial<AdminReceiptRow> = {}): AdminReceiptRow {
  return {
    id: 'receipt-7',
    donorId: 'donor-1',
    status: 'ACTIVE',
    kind: 'YEARLY',
    number: '2026-000007',
    donationId: null,
    year: 2026,
    issuedOn: '2027-01-05',
    issuedAt: '2027-01-05T09:00:00Z',
    supersededAt: null,
    withdrawnAt: null,
    withdrawalReason: null,
    giftCount: 2,
    totalAmountMinor: 120_000,
    ...overrides,
  };
}
