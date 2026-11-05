import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Dialog } from '../../../shared/ui/dialog/dialog';

@Component({
  selector: 'app-changed-meanwhile-dialog',
  imports: [Dialog],
  templateUrl: './changed-meanwhile-dialog.html',
  styleUrl: './changed-meanwhile-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangedMeanwhileDialog {
  readonly keepsDraft = input(false);
  readonly busy = input(false);
  readonly reloadChosen = output<void>();
  readonly overwriteChosen = output<void>();
  readonly dismissed = output<void>();
}
