import { FrozenReceipt, IssuedReceipt } from '../../donations/receipt-pdf/frozen-receipt';
import { donationItem, twoYearSummary } from '../../donations/testing/donation-fixtures';
import { giftsOnActiveYearlyReceipts, yearReceipt } from './yearly-receipt';

describe('Given the summary of the donations', () => {
  const summary = {
    ...twoYearSummary(),
    receiptsAvailableFrom: 2025,
    yearlyReceiptsAvailableThrough: 2025,
  };

  it('when a year the API counts as completed is asked about, then its yearly receipt is available', () => {
    expect(yearReceipt(2025, summary)).toBe('available');
  });

  it('when a later year is asked about, then its receipt comes after the year ends whatever the clock says', () => {
    expect(yearReceipt(2026, summary)).toBe('after-year-end');
    expect(yearReceipt(2026, { ...summary, yearlyReceiptsAvailableThrough: 2026 })).toBe(
      'available',
    );
  });

  it('when a year before the first receipt year is asked about, then no receipt is issued for it', () => {
    expect(yearReceipt(2024, summary)).toBe('not-issued');
  });
});

describe('Given the gifts and the issued receipts the device holds', () => {
  const yearlyOf2026 = issuedReceipt(
    'YEARLY',
    'ACTIVE',
    2026,
    yearlyFrozen([
      { receivedOn: '2026-03-15', amountMinor: 50000, source: 'BANK_TRANSFER' },
      { receivedOn: '2026-06-01', amountMinor: 125050, source: 'BANK_TRANSFER' },
    ]),
  );
  const items = [
    donationItem({ id: 'later', receivedAt: '2026-12-30', amountMinor: 30000 }),
    donationItem({ id: 'june', receivedAt: '2026-06-01', amountMinor: 125050 }),
    donationItem({ id: 'march', receivedAt: '2026-03-15', amountMinor: 50000 }),
    donationItem({ id: 'last-year', receivedAt: '2025-06-01', amountMinor: 125050 }),
  ];

  it('when an active yearly receipt lists gifts of its year, then exactly those gifts are on it, and a gift of the year that came after it and a gift of another year are not', () => {
    expect([...giftsOnActiveYearlyReceipts(items, [yearlyOf2026])].sort()).toEqual([
      'june',
      'march',
    ]);
  });

  it('when the yearly receipt was replaced or withdrawn, then no gift is on an active yearly receipt', () => {
    for (const status of ['REPLACED', 'WITHDRAWN'] as const) {
      const kept = { ...yearlyOf2026, status };
      expect(giftsOnActiveYearlyReceipts(items, [kept]).size).toBe(0);
    }
  });

  it('when two gifts of the year are alike and the yearly receipt lists one of them, then only one counts as on it', () => {
    const twins = [
      donationItem({ id: 'first', receivedAt: '2026-03-15', amountMinor: 50000 }),
      donationItem({ id: 'second', receivedAt: '2026-03-15', amountMinor: 50000 }),
    ];
    const listingOne = issuedReceipt(
      'YEARLY',
      'ACTIVE',
      2026,
      yearlyFrozen([{ receivedOn: '2026-03-15', amountMinor: 50000, source: 'BANK_TRANSFER' }]),
    );

    expect(giftsOnActiveYearlyReceipts(twins, [listingOne]).size).toBe(1);
  });

  it('when a single receipt or a yearly receipt without its frozen gifts is held, then no gift counts as on a yearly receipt', () => {
    const single = issuedReceipt('SINGLE', 'ACTIVE', null, yearlyFrozen([]));
    const withoutGifts = { ...yearlyOf2026, receipt: {} as FrozenReceipt };

    expect(giftsOnActiveYearlyReceipts(items, [single, withoutGifts]).size).toBe(0);
  });
});

function yearlyFrozen(gifts: FrozenReceipt['gifts']): FrozenReceipt {
  return { gifts } as FrozenReceipt;
}

function issuedReceipt(
  kind: IssuedReceipt['kind'],
  status: IssuedReceipt['status'],
  year: number | null,
  receipt: FrozenReceipt,
): IssuedReceipt {
  return {
    id: `${kind}-${status}-${year}`,
    status,
    kind,
    number: '2027-000001',
    donationId: null,
    year,
    issuedAt: '2027-01-15T09:00:00Z',
    supersededAt: null,
    receipt,
  };
}
