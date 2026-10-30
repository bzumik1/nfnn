/// <reference types="@angular/localize" />

import { BackupProblem } from '../admin-api';

export const BACKUP_PROBLEM_HELP: Record<BackupProblem, string> = {
  BACKUPS_UNAVAILABLE: $localize`:@@admin.backups.problem.unavailable.text:Web teď nevidí složku se zálohami, takže zálohy nejde vytvořit ani stáhnout. Data webu jsou v pořádku. Zkopírujte prosím zprávu pro technika a pošlete ji správci serveru.`,
  BACKUP_MISSING: $localize`:@@admin.backups.problem.backupMissing.text:Zatím neproběhla žádná záloha, takže data webu nejsou zálohovaná. Zkuste Zálohovat teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru.`,
  BACKUP_FAILED: $localize`:@@admin.backups.problem.backupFailed.text:Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná. Zkuste Zálohovat teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru.`,
  BACKUP_STALE: $localize`:@@admin.backups.problem.backupStale.text:Poslední záloha je starší než den, každodenní zálohování se asi zastavilo. Zkuste Zálohovat teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru.`,
  TEST_RESTORE_MISSING: $localize`:@@admin.backups.problem.testRestoreMissing.text:Zatím se nevyzkoušelo, že jde zálohu obnovit. Spusťte Ověřit obnovu teď.`,
  TEST_RESTORE_FAILED: $localize`:@@admin.backups.problem.testRestoreFailed.text:Poslední zkušební obnova se nepovedla, takže záloha možná nejde použít. Zkuste Ověřit obnovu teď; když to nepomůže, zkopírujte zprávu pro technika a pošlete ji správci serveru.`,
  TEST_RESTORE_STALE: $localize`:@@admin.backups.problem.testRestoreStale.text:Zkušební obnova neproběhla déle než týden. Spusťte Ověřit obnovu teď.`,
};

export const BACKUP_PROBLEM_TEXTS: Record<BackupProblem, string> = {
  BACKUPS_UNAVAILABLE: $localize`:@@admin.backups.problem.unavailable:Backend nevidí složku záloh. Zkontrolujte compose na serveru: backend má mít připojenou složku /DATA/AppData/nfnn/backups jako /backups.`,
  BACKUP_MISSING: $localize`:@@admin.backups.problem.backupMissing:Zatím neproběhla žádná záloha; kontejner nfnn-backup asi neběží.`,
  BACKUP_FAILED: $localize`:@@admin.backups.problem.backupFailed:Poslední záloha selhala.`,
  BACKUP_STALE: $localize`:@@admin.backups.problem.backupStale:Poslední záloha je starší než den; kontejner nfnn-backup asi neběží.`,
  TEST_RESTORE_MISSING: $localize`:@@admin.backups.problem.testRestoreMissing:Zkušební obnova ještě neproběhla, i když zálohy jsou starší než týden.`,
  TEST_RESTORE_FAILED: $localize`:@@admin.backups.problem.testRestoreFailed:Poslední zkušební obnova selhala; záloha může být nepoužitelná.`,
  TEST_RESTORE_STALE: $localize`:@@admin.backups.problem.testRestoreStale:Poslední zkušební obnova je starší než týden.`,
};
