/// <reference types="@angular/localize" />

import { formatBankTime } from '../../donations/donation-date';
import { AdminBackupsResponse, BackupProblem, BackupRunResponse } from '../admin-api';
import { formatSize } from './backup-format';
import { BACKUP_PROBLEM_HELP, BACKUP_PROBLEM_TEXTS } from './backup-texts';

const TECHNICIAN_PROBLEMS: readonly BackupProblem[] = [
  'BACKUPS_UNAVAILABLE',
  'BACKUP_MISSING',
  'BACKUP_FAILED',
  'BACKUP_STALE',
  'TEST_RESTORE_FAILED',
];

export function needsTechnician(view: AdminBackupsResponse): boolean {
  return view.problems.some((problem) => TECHNICIAN_PROBLEMS.includes(problem));
}

export function technicianMessage(view: AdminBackupsResponse): string {
  return [
    $localize`:@@admin.backups.message.intro:Zálohy webu Nová naděje potřebují pomoc správce serveru.`,
    '',
    $localize`:@@admin.backups.message.problems:Co je špatně:`,
    ...view.problems.map((problem) => `- ${BACKUP_PROBLEM_HELP[problem]}`),
    '',
    $localize`:@@admin.backups.message.details:Technické podrobnosti:`,
    ...view.problems.map((problem) => `- ${BACKUP_PROBLEM_TEXTS[problem]}`),
    `- ${$localize`:@@admin.backups.message.lastBackup:Poslední záloha: ${backupLine(view.lastBackup)}:run:`}`,
    `- ${$localize`:@@admin.backups.message.lastTestRestore:Poslední zkušební obnova: ${testRestoreLine(view.lastTestRestore)}:run:`}`,
  ].join('\n');
}

function backupLine(run: BackupRunResponse | null): string {
  if (run === null) {
    return noneYet();
  }
  if (run.outcome === 'FAILED') {
    return failedLine(run);
  }
  return `${formatBankTime(run.finishedAt)}, ${run.fileName ?? ''} (${formatSize(run.sizeBytes ?? 0)})`;
}

function testRestoreLine(run: BackupRunResponse | null): string {
  if (run === null) {
    return noneYet();
  }
  if (run.outcome === 'FAILED') {
    return failedLine(run);
  }
  return $localize`:@@admin.backups.message.testRestoreOk:${formatBankTime(run.finishedAt)}:time:, ${run.tables ?? 0}:tables: tabulek, ${run.fileName ?? ''}:file:`;
}

function failedLine(run: BackupRunResponse): string {
  const at = formatBankTime(run.finishedAt);
  return run.error === null
    ? $localize`:@@admin.backups.message.failed:nepovedla se ${at}:time:`
    : $localize`:@@admin.backups.message.failedWith:nepovedla se ${at}:time:: ${run.error}:error:`;
}

function noneYet(): string {
  return $localize`:@@admin.backups.message.none:zatím žádná`;
}
