import { describe, expect, it } from 'vitest';
import { asText, crownsOf, pragueInstant, shape } from '../src/format.js';

describe('Given values as the administration answers them', () => {
  it('when minor amounts are shaped, then they become numbers of crowns under the key without the suffix', () => {
    expect(crownsOf(123450)).toBe(1234.5);
    expect(shape({ amountMinor: 50000, totalAmountMinor: 0, currency: 'CZK', count: 2 })).toEqual({
      amount: 500,
      totalAmount: 0,
      currency: 'CZK',
      count: 2,
    });
  });

  it('when instants are shaped, then they read as ISO 8601 in Prague time with its offset and dates stay as they are', () => {
    expect(pragueInstant('2026-01-15T23:30:00Z')).toBe('2026-01-16T00:30:00+01:00');
    expect(pragueInstant('2026-10-25T00:30:00.123456Z')).toBe('2026-10-25T02:30:00+02:00');
    expect(pragueInstant('2026-10-25T01:30:00Z')).toBe('2026-10-25T02:30:00+01:00');
    expect(
      shape({
        receivedOn: '2026-10-10',
        importedAt: '2026-10-17T10:00:00Z',
        items: [{ at: '2026-07-01T00:00:00+02:00' }],
      }),
    ).toEqual({
      receivedOn: '2026-10-10',
      importedAt: '2026-10-17T12:00:00+02:00',
      items: [{ at: '2026-07-01T00:00:00+02:00' }],
    });
  });

  it('when a value becomes text, then it is compact JSON with nulls kept', () => {
    expect(asText({ donation: null, amountMinor: 100 })).toBe('{"donation":null,"amount":1}');
  });
});
