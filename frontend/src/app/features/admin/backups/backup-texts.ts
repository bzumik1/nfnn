/// <reference types="@angular/localize" />

import { BackupProblem } from '../admin-api';

const ASK_TECHNICIAN = $localize`:@@admin.backups.problem.action.askTechnician:Zkopírujte prosím zprávu pro technika a pošlete ji správci serveru, který web nainstaloval.`;
const RETRY_BACKUP = $localize`:@@admin.backups.problem.action.retryBackup:Zkuste Zálohovat teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru, který web nainstaloval.`;
const RETRY_TEST_RESTORE = $localize`:@@admin.backups.problem.action.retryTestRestore:Zkuste Ověřit obnovu teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru, který web nainstaloval.`;
const RUN_TEST_RESTORE = $localize`:@@admin.backups.problem.action.runTestRestore:Spusťte Ověřit obnovu teď.`;

export const BACKUP_PROBLEM_SUMMARIES: Record<BackupProblem, string> = {
  BACKUPS_UNAVAILABLE: $localize`:@@admin.backups.problem.unavailable.summary:Web teď nevidí složku se zálohami, takže zálohy nejde vytvořit ani stáhnout. Data webu jsou v pořádku.`,
  BACKUP_MISSING: $localize`:@@admin.backups.problem.backupMissing.summary:Zatím neproběhla žádná záloha, takže data webu nejsou zálohovaná.`,
  BACKUP_FAILED: $localize`:@@admin.backups.problem.backupFailed.summary:Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná.`,
  BACKUP_STALE: $localize`:@@admin.backups.problem.backupStale.summary:Poslední záloha je starší než den, každodenní zálohování se asi zastavilo.`,
  TEST_RESTORE_MISSING: $localize`:@@admin.backups.problem.testRestoreMissing.summary:Zatím se nevyzkoušelo, že jde zálohu obnovit.`,
  TEST_RESTORE_FAILED: $localize`:@@admin.backups.problem.testRestoreFailed.summary:Poslední zkušební obnova se nepovedla, takže záloha možná nejde použít.`,
  TEST_RESTORE_STALE: $localize`:@@admin.backups.problem.testRestoreStale.summary:Zkušební obnova neproběhla déle než týden.`,
};

const BACKUP_PROBLEM_ACTIONS: Record<BackupProblem, string> = {
  BACKUPS_UNAVAILABLE: ASK_TECHNICIAN,
  BACKUP_MISSING: RETRY_BACKUP,
  BACKUP_FAILED: RETRY_BACKUP,
  BACKUP_STALE: RETRY_BACKUP,
  TEST_RESTORE_MISSING: RUN_TEST_RESTORE,
  TEST_RESTORE_FAILED: RETRY_TEST_RESTORE,
  TEST_RESTORE_STALE: RUN_TEST_RESTORE,
};

export const BACKUP_PROBLEM_HELP = Object.fromEntries(
  Object.entries(BACKUP_PROBLEM_SUMMARIES).map(([problem, summary]) => [
    problem,
    `${summary} ${BACKUP_PROBLEM_ACTIONS[problem as BackupProblem]}`,
  ]),
) as Record<BackupProblem, string>;

export const BACKUP_PROBLEM_TEXTS: Record<BackupProblem, string> = {
  BACKUPS_UNAVAILABLE: $localize`:@@admin.backups.problem.unavailable:Backend nevidí složku záloh. Zkontrolujte compose na serveru: backend má mít připojenou složku /DATA/AppData/nfnn/backups jako /backups.`,
  BACKUP_MISSING: $localize`:@@admin.backups.problem.backupMissing:Zatím neproběhla žádná záloha; kontejner nfnn-backup asi neběží.`,
  BACKUP_FAILED: $localize`:@@admin.backups.problem.backupFailed:Poslední záloha selhala.`,
  BACKUP_STALE: $localize`:@@admin.backups.problem.backupStale:Poslední záloha je starší než den; kontejner nfnn-backup asi neběží.`,
  TEST_RESTORE_MISSING: $localize`:@@admin.backups.problem.testRestoreMissing:Zkušební obnova ještě neproběhla, i když zálohy jsou starší než týden.`,
  TEST_RESTORE_FAILED: $localize`:@@admin.backups.problem.testRestoreFailed:Poslední zkušební obnova selhala; záloha může být nepoužitelná.`,
  TEST_RESTORE_STALE: $localize`:@@admin.backups.problem.testRestoreStale:Poslední zkušební obnova je starší než týden.`,
};
