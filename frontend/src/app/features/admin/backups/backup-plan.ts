import { BackupPlan } from '../admin-api';

export interface BackupDay {
  value: number;
  name: string;
}

export const BACKUP_DAYS: readonly BackupDay[] = [
  { value: 1, name: $localize`:@@admin.backups.schedule.day.1:pondělí` },
  { value: 2, name: $localize`:@@admin.backups.schedule.day.2:úterý` },
  { value: 3, name: $localize`:@@admin.backups.schedule.day.3:středa` },
  { value: 4, name: $localize`:@@admin.backups.schedule.day.4:čtvrtek` },
  { value: 5, name: $localize`:@@admin.backups.schedule.day.5:pátek` },
  { value: 6, name: $localize`:@@admin.backups.schedule.day.6:sobota` },
  { value: 7, name: $localize`:@@admin.backups.schedule.day.7:neděle` },
];

const ON_DAY: Record<number, string> = {
  1: $localize`:@@admin.backups.schedule.on.1:v pondělí`,
  2: $localize`:@@admin.backups.schedule.on.2:v úterý`,
  3: $localize`:@@admin.backups.schedule.on.3:ve středu`,
  4: $localize`:@@admin.backups.schedule.on.4:ve čtvrtek`,
  5: $localize`:@@admin.backups.schedule.on.5:v pátek`,
  6: $localize`:@@admin.backups.schedule.on.6:v sobotu`,
  7: $localize`:@@admin.backups.schedule.on.7:v neděli`,
};

export function formatPlanTime(time: string): string {
  return time.replace(/^0(?=\d:)/, '');
}

export function onDay(day: number): string {
  return ON_DAY[day] ?? '';
}

export function describePlan(plan: BackupPlan): string {
  return $localize`:@@admin.backups.schedule.describe:denní záloha ${formatPlanTime(plan.backupTime)}:backupTime:, zkušební obnova ${onDay(plan.testRestoreDay)}:day: ${formatPlanTime(plan.testRestoreTime)}:testRestoreTime:`;
}

export function samePlan(first: BackupPlan, second: BackupPlan): boolean {
  return (
    first.backupTime === second.backupTime &&
    first.testRestoreDay === second.testRestoreDay &&
    first.testRestoreTime === second.testRestoreTime
  );
}
