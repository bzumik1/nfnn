import {
  formatBankTime,
  formatDonationDate,
  formatPragueClock,
  pragueDay,
  pragueHour,
  pragueTime,
} from './donation-date';

describe('Given a date the donations API sends', () => {
  it('when it is formatted, then it reads as day, month and year without leading zeros', () => {
    expect(formatDonationDate('2026-03-15')).toBe('15. 3. 2026');
    expect(formatDonationDate('2025-11-05')).toBe('5. 11. 2025');
    expect(formatDonationDate('2026-01-01')).toBe('1. 1. 2026');
  });

  it('when it is the last day of the year, then no time zone shifts it into the next year', () => {
    expect(formatDonationDate('2025-12-31')).toBe('31. 12. 2025');
  });
});

describe('Given the time the bank data was last updated', () => {
  it('when it is formatted, then it reads as the Prague date and time without leading zeros but with two-digit minutes', () => {
    expect(formatBankTime('2026-10-18T08:05:30Z')).toBe('18. 10. 2026 10:05');
    expect(formatBankTime('2026-01-05T07:09:00.123456Z')).toBe('5. 1. 2026 8:09');
  });

  it('when it is just before midnight in UTC, then it reads as the next Prague day', () => {
    expect(formatBankTime('2025-12-31T23:30:00Z')).toBe('1. 1. 2026 0:30');
  });
});

describe('Given an instant the API sends', () => {
  it('when its Prague day is asked for, then it comes as YYYY-MM-DD for a date filter', () => {
    expect(pragueDay('2026-10-28T20:14:00Z')).toBe('2026-10-28');
  });

  it('when it is late in the evening in UTC, then the day is already the next Prague day', () => {
    expect(pragueDay('2026-10-28T23:30:00Z')).toBe('2026-10-29');
  });

  it('when its Prague hour is asked for, then it counts in Prague summer and winter time', () => {
    expect(pragueHour('2026-10-01T05:00:00Z')).toBe(7);
    expect(pragueHour('2026-11-01T06:00:00Z')).toBe(7);
  });

  it('when its Prague time of day is asked for, then it comes on a 24-hour clock without a leading zero in the hour', () => {
    expect(formatPragueClock('2026-11-06T02:35:00Z')).toBe('3:35');
    expect(formatPragueClock('2026-07-01T21:05:00Z')).toBe('23:05');
  });

  it('when its Prague time of day is asked for, then it reads with seconds and no leading zero in the hour', () => {
    expect(pragueTime('2026-11-10T08:05:07.639+01:00')).toBe('8:05:07');
    expect(pragueTime('2026-11-10T20:46:01.513Z')).toBe('21:46:01');
  });
});
