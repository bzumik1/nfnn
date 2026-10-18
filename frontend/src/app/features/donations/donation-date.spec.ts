import { formatDonationDate } from './donation-date';

describe('Given a date the donations API sends', () => {
  it('when it is formatted, then it reads as day, month and year with leading zeros', () => {
    expect(formatDonationDate('2026-03-15')).toBe('15. 03. 2026');
    expect(formatDonationDate('2025-11-05')).toBe('05. 11. 2025');
  });

  it('when it is the last day of the year, then no time zone shifts it into the next year', () => {
    expect(formatDonationDate('2025-12-31')).toBe('31. 12. 2025');
  });
});
