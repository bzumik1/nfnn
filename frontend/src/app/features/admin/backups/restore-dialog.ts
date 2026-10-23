import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { formatBankTime } from '../../donations/donation-date';
import { BackupFileResponse } from '../admin-api';

@Component({
  selector: 'app-restore-dialog',
  imports: [Dialog],
  templateUrl: './restore-dialog.html',
  styleUrl: './restore-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestoreDialog {
  readonly backup = input.required<BackupFileResponse>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly confirmed = output<void>();
  readonly dismissed = output<void>();

  protected readonly createdAt = computed(() => formatBankTime(this.backup().createdAt));

  protected confirm(): void {
    if (!this.busy()) {
      this.confirmed.emit();
    }
  }

  protected dismiss(): void {
    if (!this.busy()) {
      this.dismissed.emit();
    }
  }
}
