import { thousandsGroups } from './thousands-groups';

describe('Given the digits of a typed amount', () => {
  it('when they are split by thousands, then the leading group keeps what is left over and the rest come in threes', () => {
    expect([...thousandsGroups('7')]).toEqual(['7']);
    expect([...thousandsGroups('250')]).toEqual(['250']);
    expect([...thousandsGroups('1250')]).toEqual(['1', '250']);
    expect([...thousandsGroups('001000')]).toEqual(['001', '000']);
    expect([...thousandsGroups('1250000')]).toEqual(['1', '250', '000']);
  });

  it('when 50 000 pasted digits are split, then each step yields one group of at most three digits and no digit is lost', () => {
    const digits = '12' + '345'.repeat(16_666);

    const groups = [...thousandsGroups(digits)];

    expect(digits.length).toBe(50_000);
    expect(groups.length).toBe(16_667);
    expect(groups[0]).toBe('12');
    expect(groups.every((group) => group.length <= 3)).toBe(true);
    expect(groups.join('')).toBe(digits);
  });
});
