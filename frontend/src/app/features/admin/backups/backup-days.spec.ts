import { backupFile } from '../testing/admin-fixtures';
import { backupDays } from './backup-days';

describe('Given the backups on the server newest first', () => {
  const backups = [
    backupFile({ fileName: 'nfnn-2026-11-07_0037.dump.age', createdAt: '2026-11-06T23:37:52Z' }),
    backupFile({ fileName: 'nfnn-2026-11-06_2220.dump.age', createdAt: '2026-11-06T21:20:50Z' }),
    backupFile({ fileName: 'nfnn-2026-11-06_0300.dump.age', createdAt: '2026-11-06T02:00:19Z' }),
    backupFile({ fileName: 'nfnn-2026-10-25_0300.dump.age', createdAt: '2026-10-25T02:00:11Z' }),
  ];

  it('when they are grouped, then each Prague day is a group titled with its capitalised weekday and date, newest first', () => {
    expect(backupDays(backups).map((day) => day.title)).toEqual([
      'Sobota 7.\u00a011. 2026',
      'Pátek 6.\u00a011. 2026',
      'Neděle 25.\u00a010. 2026',
    ]);
  });

  it('when they are grouped, then each backup keeps its order and shows its Prague time without a leading zero', () => {
    expect(
      backupDays(backups).map((day) =>
        day.backups.map(({ time, backup }) => [time, backup.fileName]),
      ),
    ).toEqual([
      [['0:37', 'nfnn-2026-11-07_0037.dump.age']],
      [
        ['22:20', 'nfnn-2026-11-06_2220.dump.age'],
        ['3:00', 'nfnn-2026-11-06_0300.dump.age'],
      ],
      [['3:00', 'nfnn-2026-10-25_0300.dump.age']],
    ]);
  });

  it('when there is none, then there is no group', () => {
    expect(backupDays([])).toEqual([]);
  });
});
