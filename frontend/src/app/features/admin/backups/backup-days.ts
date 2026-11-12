import { formatBankTime, pragueDay } from '../../donations/donation-date';
import { BackupFileResponse } from '../admin-api';
import { BACKUP_DAYS } from './backup-plan';

export interface BackupAtTime {
  time: string;
  backup: BackupFileResponse;
}

export interface BackupDay {
  day: string;
  title: string;
  backups: BackupAtTime[];
}

export function backupDays(backups: readonly BackupFileResponse[]): BackupDay[] {
  const days: BackupDay[] = [];
  for (const backup of backups) {
    const day = pragueDay(backup.createdAt);
    const at = formatBankTime(backup.createdAt);
    const separator = at.lastIndexOf(' ');
    const entry = { time: at.slice(separator + 1), backup };
    const current = days.at(-1);
    if (current?.day === day) {
      current.backups.push(entry);
    } else {
      days.push({ day, title: `${weekdayOf(day)} ${at.slice(0, separator)}`, backups: [entry] });
    }
  }
  return days;
}

function weekdayOf(day: string): string {
  const isoWeekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
  return BACKUP_DAYS.find((candidate) => candidate.value === isoWeekday)?.name ?? '';
}
