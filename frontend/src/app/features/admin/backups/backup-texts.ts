/// <reference types="@angular/localize" />

import { BackupProblem } from '../admin-api';

export const BACKUP_PROBLEM_TEXTS: Record<BackupProblem, string> = {
  BACKUPS_UNAVAILABLE: $localize`:@@admin.backups.problem.unavailable:Backend nevidí složku záloh. Zkontrolujte compose na serveru: backend má mít připojenou složku /DATA/AppData/nfnn/backups jako /backups.`,
  BACKUP_MISSING: $localize`:@@admin.backups.problem.backupMissing:Zatím neproběhla žádná záloha; kontejner nfnn-backup asi neběží.`,
  BACKUP_FAILED: $localize`:@@admin.backups.problem.backupFailed:Poslední záloha selhala.`,
  BACKUP_STALE: $localize`:@@admin.backups.problem.backupStale:Poslední záloha je starší než den; kontejner nfnn-backup asi neběží.`,
  TEST_RESTORE_MISSING: $localize`:@@admin.backups.problem.testRestoreMissing:Zkušební obnova ještě neproběhla, i když zálohy jsou starší než týden.`,
  TEST_RESTORE_FAILED: $localize`:@@admin.backups.problem.testRestoreFailed:Poslední zkušební obnova selhala; záloha může být nepoužitelná.`,
  TEST_RESTORE_STALE: $localize`:@@admin.backups.problem.testRestoreStale:Poslední zkušební obnova je starší než týden.`,
};
