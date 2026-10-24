import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { Dialog } from '../../../shared/ui/dialog/dialog';

@Component({
  selector: 'app-unsaved-changes-dialog',
  imports: [Dialog],
  templateUrl: './unsaved-changes-dialog.html',
  styleUrl: './unsaved-changes-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnsavedChangesDialog {
  readonly stayed = output<void>();
  readonly saveChosen = output<void>();
  readonly leaveChosen = output<void>();
}
