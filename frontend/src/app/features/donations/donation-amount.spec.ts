import { formatCrowns, formatMinorUnits } from './donation-amount';
import { sharedCases } from '../../../testing/shared-cases';

describe('Given an amount in crowns', () => {
  it('when it is whole, then it is grouped by thousands without decimals', () => {
    expect(formatCrowns(1750)).toBe('1 750');
    expect(formatCrowns(0)).toBe('0');
  });

  it('when it has hellers, then it always shows two decimals', () => {
    expect(formatCrowns(1000.5)).toBe('1 000,50');
    expect(formatCrowns(123.45)).toBe('123,45');
  });
});

describe('Given an amount in hellers as the API sends it', () => {
  it('when it is whole crowns, then it reads as crowns without decimals', () => {
    expect(formatMinorUnits(175000)).toBe('1 750');
  });

  it('when it has hellers, then it reads as crowns with two decimals', () => {
    expect(formatMinorUnits(100050)).toBe('1 000,50');
  });
});

const CZECH_RECEIPT_AMOUNTS = sharedCases('receipts/formatting.json').flatMap((sharedCase) =>
  sharedCase.input.format === 'czechAmount' && 'text' in sharedCase.expected
    ? [
        {
          name: sharedCase.name,
          amountMinor: sharedCase.input.amountMinor,
          text: sharedCase.expected.text,
        },
      ]
    : [],
);

describe('Given the shared receipt formatting cases of Czech amounts', () => {
  it('when they are read, then there are some to run', () => {
    expect(CZECH_RECEIPT_AMOUNTS.length).toBeGreaterThan(0);
  });
});

for (const sharedCase of CZECH_RECEIPT_AMOUNTS) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    it('when the hellers are formatted as crowns followed by Kč, then the text reads as a receipt prints it', () => {
      expect(`${formatMinorUnits(sharedCase.amountMinor)}\u00a0Kč`).toBe(sharedCase.text);
    });
  });
}
