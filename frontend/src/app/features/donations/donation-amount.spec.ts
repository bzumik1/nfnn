import { formatCrowns } from './donation-amount';

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
