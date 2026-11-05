import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { formatBankTime } from '../../donations/donation-date';

export type ChangedSubject = 'payment' | 'donorAccount' | 'symbolClaim' | 'content';

@Component({
  selector: 'app-changed-meanwhile-dialog',
  imports: [Dialog],
  templateUrl: './changed-meanwhile-dialog.html',
  styleUrl: './changed-meanwhile-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangedMeanwhileDialog {
  readonly subject = input.required<ChangedSubject>();
  readonly keepsDraft = input(false);
  readonly canOverwrite = input(true);
  readonly savedAt = input<string | null>(null);
  readonly busy = input(false);
  readonly reloadChosen = output<void>();
  readonly overwriteChosen = output<void>();
  readonly dismissed = output<void>();

  protected readonly savedAtText = computed(() => {
    const savedAt = this.savedAt();
    return savedAt === null ? null : formatBankTime(savedAt);
  });
}

export interface ChangedMeanwhileState {
  readonly version: string | null;
  readonly draft: boolean;
  readonly overwrite: boolean;
  readonly publish: boolean;
  readonly savedAt: string | null;
}
