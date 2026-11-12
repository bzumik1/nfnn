import { todayProblems } from './today-problems';

const line = (time: string, level: string, logger: string, message: string) =>
  `2026-11-10T${time}+01:00 ${level.padStart(5)} 1 --- [nova-nadeje] [scheduling-1] ${logger} : ${message}`;

describe('Given the newest warnings and errors of backend.log', () => {
  const matches = [
    {
      offset: 900,
      line: line(
        '09:12:40.000',
        'WARN',
        'c.n.a.o.i.r.ClientErrorController',
        'Browser error kind=chunk-load',
      ),
    },
    {
      offset: 800,
      line: line('08:58:02.000', 'WARN', 'c.n.a.d.a.FixedWindowRateLimiter', 'Rate limit reached'),
    },
    {
      offset: 700,
      line: line(
        '07:30:11.000',
        'ERROR',
        'c.n.a.o.a.backup.BackupWatchService',
        'Backup watch failed',
      ),
    },
    {
      offset: 600,
      line: line('06:58:02.000', 'WARN', 'c.n.a.d.a.FixedWindowRateLimiter', 'Rate limit reached'),
    },
    {
      offset: 500,
      line: line('05:00:00.000', 'WARN', 'c.n.a.d.a.FixedWindowRateLimiter', 'Rate limit reached'),
    },
    {
      offset: 100,
      line: '2026-11-09T23:59:00.000+01:00  WARN 1 --- [nova-nadeje] [main] c.n.a.App : Yesterday',
    },
  ];

  it('when today is asked for, then the same message is counted once at its newest time and yesterday is left out', () => {
    const problems = todayProblems(matches, '2026-11-10');

    expect(
      problems.map((problem) => [problem.entry.offset, problem.entry.level, problem.count]),
    ).toEqual([
      [900, 'WARN', 1],
      [800, 'WARN', 3],
      [700, 'ERROR', 1],
    ]);
  });

  it('when nothing happened today, then there is no problem', () => {
    expect(todayProblems(matches, '2026-11-11')).toEqual([]);
  });
});
