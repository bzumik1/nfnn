import { describe, expect, it } from 'vitest';
import { asText, formatCrowns, formatPragueInstant, shape } from '../src/format.js';

describe('Given values as the administration answers them', () => {
  it('when minor amounts are shaped, then they read in crowns under the key without the suffix', () => {
    expect(formatCrowns(123450)).toBe('1 234,50 Kč');
    expect(shape({ amountMinor: 50000, totalAmountMinor: 0, currency: 'CZK', count: 2 })).toEqual({
      amount: '500,00 Kč',
      totalAmount: '0,00 Kč',
      currency: 'CZK',
      count: 2,
    });
  });

  it('when instants are shaped, then they read in Prague time and dates stay as they are', () => {
    expect(formatPragueInstant('2026-01-15T23:30:00Z')).toBe('16. 01. 2026 00:30:00');
    expect(
      shape({
        receivedOn: '2026-10-10',
        importedAt: '2026-10-17T10:00:00Z',
        items: [{ at: '2026-07-01T00:00:00+02:00' }],
      }),
    ).toEqual({
      receivedOn: '2026-10-10',
      importedAt: '17. 10. 2026 12:00:00',
      items: [{ at: '01. 07. 2026 00:00:00' }],
    });
  });

  it('when a value becomes text, then it is indented JSON with nulls kept', () => {
    expect(asText({ donation: null, amountMinor: 100 })).toBe(
      '{\n  "donation": null,\n  "amount": "1,00 Kč"\n}',
    );
  });
});
