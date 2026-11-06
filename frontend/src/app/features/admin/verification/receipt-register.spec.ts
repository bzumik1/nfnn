import { registerEntry } from './receipt-register';
import { receiptRow, SIGNED_YEARLY } from './testing/register-fixtures';

describe('Given a receipt whose signature the page verified', () => {
  it('when no administration copy is loaded, then the register entry says so', () => {
    expect(registerEntry(SIGNED_YEARLY, null)).toEqual({ state: 'no-copy' });
  });

  it('when the copy holds no receipt of its number, then the entry says the copy does not hold it', () => {
    expect(registerEntry(SIGNED_YEARLY, [receiptRow({ number: '2026-000008' })])).toEqual({
      state: 'not-held',
    });
  });

  it('when the copy holds it as active, then the entry is active and names the donor', () => {
    expect(registerEntry(SIGNED_YEARLY, [receiptRow()])).toEqual({
      state: 'active',
      donorId: 'donor-1',
    });
  });

  describe('when the copy holds it as replaced', () => {
    const replaced = receiptRow({ status: 'REPLACED', supersededAt: '2027-02-01T10:00:00Z' });

    it('and holds the later yearly receipt of the same donor and year, then the entry names the newer number', () => {
      const rows = [
        receiptRow({
          id: 'r9',
          number: '2026-000009',
          issuedAt: '2027-03-01T10:00:00.250Z',
          status: 'REPLACED',
        }),
        receiptRow({ id: 'r8', number: '2026-000008', issuedAt: '2027-02-01T10:00:00.5Z' }),
        receiptRow({
          id: 'other',
          number: '2026-000010',
          donorId: 'donor-2',
          issuedAt: '2027-02-01T09:00:00Z',
        }),
        receiptRow({
          id: 'old',
          number: '2025-000003',
          year: 2025,
          issuedAt: '2027-01-10T09:00:00Z',
        }),
        replaced,
      ];

      expect(registerEntry(SIGNED_YEARLY, rows)).toEqual({
        state: 'replaced',
        donorId: 'donor-1',
        on: '2027-02-01T10:00:00Z',
        by: '2026-000008',
      });
    });

    it('and holds no later receipt, then the entry is replaced without a newer number', () => {
      expect(registerEntry(SIGNED_YEARLY, [replaced])).toEqual({
        state: 'replaced',
        donorId: 'donor-1',
        on: '2027-02-01T10:00:00Z',
        by: null,
      });
    });

    it('and it is a single receipt, then the newer one is the later receipt of the same gift', () => {
      const single = {
        ...SIGNED_YEARLY,
        kind: 'single' as const,
        year: null,
        gifts: [SIGNED_YEARLY.gifts[0]],
        totalMinor: 50_000,
      };
      const row = { kind: 'SINGLE' as const, year: null, giftCount: 1, totalAmountMinor: 50_000 };
      const rows = [
        receiptRow({
          ...row,
          status: 'REPLACED',
          donationId: 'gift-1',
          supersededAt: '2027-02-01T10:00:00Z',
        }),
        receiptRow({
          ...row,
          id: 'n2',
          number: '2026-000012',
          donationId: 'gift-2',
          issuedAt: '2027-01-20T09:00:00Z',
        }),
        receiptRow({
          ...row,
          id: 'n1',
          number: '2027-000001',
          donationId: 'gift-1',
          issuedAt: '2027-02-01T10:00:00Z',
        }),
      ];

      expect(registerEntry(single, rows)).toMatchObject({ state: 'replaced', by: '2027-000001' });
    });
  });

  it('when the copy holds it as withdrawn because the gifts changed, then the entry is outdated', () => {
    const row = receiptRow({
      status: 'WITHDRAWN',
      withdrawalReason: 'DONATIONS_CHANGED',
      withdrawnAt: '2027-02-02T08:00:00Z',
    });

    expect(registerEntry(SIGNED_YEARLY, [row])).toEqual({
      state: 'outdated',
      donorId: 'donor-1',
      on: '2027-02-02T08:00:00Z',
    });
  });

  it('when the copy holds it as withdrawn for no named reason, then the entry is withdrawn', () => {
    const row = receiptRow({ status: 'WITHDRAWN', withdrawnAt: '2027-02-02T08:00:00Z' });

    expect(registerEntry(SIGNED_YEARLY, [row])).toEqual({
      state: 'withdrawn',
      donorId: 'donor-1',
      on: '2027-02-02T08:00:00Z',
    });
  });

  describe('when the copy holds its number with other data', () => {
    it.each([
      ['another kind', { kind: 'SINGLE' as const }],
      ['another day of issue', { issuedOn: '2027-01-06' }],
      ['another number of gifts', { giftCount: 3 }],
      ['another total', { totalAmountMinor: 120_100 }],
      ['another year', { year: 2025 }],
    ])('with %s, then the entry says the copy differs', (_, change) => {
      expect(registerEntry(SIGNED_YEARLY, [receiptRow(change)])).toEqual({
        state: 'differs',
        donorId: 'donor-1',
      });
    });
  });
});
