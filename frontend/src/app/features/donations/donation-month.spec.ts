import { formatMonth, formatMonthRange } from './donation-month';

describe('Given a month the bank accounts API sends', () => {
  it('when it is formatted, then it reads as its Czech name and the year joined by a no-break space', () => {
    expect(formatMonth('2025-01')).toBe('leden 2025');
    expect(formatMonth('2026-10')).toBe('říjen 2026');
  });

  it('when every month of a year is formatted, then each gets its own nominative name', () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      formatMonth(`2026-${String(index + 1).padStart(2, '0')}`),
    );

    expect(months).toEqual([
      'leden 2026',
      'únor 2026',
      'březen 2026',
      'duben 2026',
      'květen 2026',
      'červen 2026',
      'červenec 2026',
      'srpen 2026',
      'září 2026',
      'říjen 2026',
      'listopad 2026',
      'prosinec 2026',
    ]);
  });
});

describe('Given the first and the last month of some payments', () => {
  it('when both are the same month, then only that month shows', () => {
    expect(formatMonthRange('2026-10', '2026-10')).toBe('říjen 2026');
  });

  it('when both are in the same year, then the months are joined by an en dash and the year shows once', () => {
    expect(formatMonthRange('2026-03', '2026-10')).toBe('březen–říjen 2026');
  });

  it('when the years differ, then both months show with their years around a spaced en dash that cannot start a line', () => {
    expect(formatMonthRange('2025-01', '2026-10')).toBe('leden 2025 – říjen 2026');
  });
});
