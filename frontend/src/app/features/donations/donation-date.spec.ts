import { formatBankTime, formatDonationDate, pragueDay } from './donation-date';

describe('Given a date the donations API sends', () => {
  it('when it is formatted, then it reads as day, month and year with leading zeros', () => {
    expect(formatDonationDate('2026-03-15')).toBe('15. 03. 2026');
    expect(formatDonationDate('2025-11-05')).toBe('05. 11. 2025');
  });

  it('when it is the last day of the year, then no time zone shifts it into the next year', () => {
    expect(formatDonationDate('2025-12-31')).toBe('31. 12. 2025');
  });
});

describe('Given the time the bank data was last updated', () => {
  it('when it is formatted, then it reads as the Prague date and time with leading zeros', () => {
    expect(formatBankTime('2026-10-18T08:05:30Z')).toBe('18. 10. 2026 10:05');
    expect(formatBankTime('2026-01-05T07:09:00.123456Z')).toBe('05. 01. 2026 08:09');
  });

  it('when it is just before midnight in UTC, then it reads as the next Prague day', () => {
    expect(formatBankTime('2025-12-31T23:30:00Z')).toBe('01. 01. 2026 00:30');
  });
});

describe('Given an instant the API sends', () => {
  it('when its Prague day is asked for, then it comes as YYYY-MM-DD for a date filter', () => {
    expect(pragueDay('2026-10-28T20:14:00Z')).toBe('2026-10-28');
  });

  it('when it is late in the evening in UTC, then the day is already the next Prague day', () => {
    expect(pragueDay('2026-10-28T23:30:00Z')).toBe('2026-10-29');
  });
});
