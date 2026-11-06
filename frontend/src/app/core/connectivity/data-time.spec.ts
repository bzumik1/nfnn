import { formatDataDay, formatDataTime } from './data-time';

const NOW = Date.parse('2026-11-05T11:30:00Z');

describe('Given the time of the data shown offline', () => {
  it('when the data are from today in Prague, then only the time is shown', () => {
    expect(formatDataTime(Date.parse('2026-11-05T08:05:00Z'), NOW)).toBe('9:05');
  });

  it('when the data are from yesterday in Prague, then the day and the time are shown', () => {
    expect(formatDataTime(Date.parse('2026-11-04T22:30:00Z'), NOW)).toBe('4. 11. 23:30');
  });

  it('when the data are older, then only the day with the year is shown', () => {
    expect(formatDataTime(Date.parse('2026-03-15T10:00:00Z'), NOW)).toBe('15. 3. 2026');
  });

  it('when it is just after midnight in Prague, then data from before midnight are yesterday', () => {
    const justAfterMidnight = Date.parse('2026-11-04T23:10:00Z');

    expect(formatDataTime(Date.parse('2026-11-04T22:50:00Z'), justAfterMidnight)).toBe(
      '4. 11. 23:50',
    );
  });

  it('when only the day is asked for, then it is the Prague day with the year', () => {
    expect(formatDataDay(Date.parse('2026-10-11T22:30:00Z'))).toBe('12. 10. 2026');
    expect(formatDataDay(Date.parse('2026-03-04T23:30:00Z'))).toBe('5. 3. 2026');
  });
});
