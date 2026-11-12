import { BackupKind } from '../admin-api';

const KIND_NAMES: Record<BackupKind, string> = {
  DAILY: $localize`:@@admin.backups.kind.daily:Plánovaná`,
  REQUESTED: $localize`:@@admin.backups.kind.requested:Na požádání`,
  BEFORE_RESTORE: $localize`:@@admin.backups.kind.beforeRestore:Před obnovou`,
  OTHER: $localize`:@@admin.backups.kind.other:Jiná`,
};

export function backupKindName(kind: BackupKind): string {
  return KIND_NAMES[kind];
}
