import { describePlan, formatPlanTime, samePlan } from './backup-plan';

describe('Given a backup plan', () => {
  const plan = { backupTime: '03:00', testRestoreDay: 7, testRestoreTime: '04:30' };

  it('when it is described, then the times lose the leading zero and the day reads in Czech', () => {
    expect(describePlan(plan)).toBe('denní záloha 3:00, zkušební obnova v neděli 4:30');
    expect(describePlan({ backupTime: '23:15', testRestoreDay: 3, testRestoreTime: '00:05' })).toBe(
      'denní záloha 23:15, zkušební obnova ve středu 0:05',
    );
  });

  it('when a time is formatted, then only an hour below ten loses its zero', () => {
    expect(formatPlanTime('09:05')).toBe('9:05');
    expect(formatPlanTime('10:00')).toBe('10:00');
  });

  it('when it is compared, then only the same times and day are the same plan', () => {
    expect(samePlan(plan, { ...plan })).toBe(true);
    expect(samePlan(plan, { ...plan, testRestoreDay: 6 })).toBe(false);
  });
});
