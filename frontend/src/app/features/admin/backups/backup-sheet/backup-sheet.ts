import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Dialog } from '../../../../shared/ui/dialog/dialog';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formatBankTime } from '../../../donations/donation-date';
import { BackupFileResponse } from '../../admin-api';
import { formatSize } from '../backup-format';
import { backupKindName } from '../backup-kinds';

@Component({
  selector: 'app-backup-sheet',
  imports: [Dialog, NeedsConnection],
  templateUrl: './backup-sheet.html',
  styleUrl: './backup-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupSheet {
  readonly backup = input.required<BackupFileResponse>();
  readonly downloading = input(false);
  readonly failure = input<string | null>(null);
  readonly restoreBlocked = input(false);
  readonly download = output<void>();
  readonly restore = output<void>();
  readonly dismissed = output<void>();

  protected readonly createdAt = computed(() => formatBankTime(this.backup().createdAt));
  protected readonly meta = computed(
    () => `${backupKindName(this.backup().kind)} · ${formatSize(this.backup().sizeBytes)}`,
  );
}
