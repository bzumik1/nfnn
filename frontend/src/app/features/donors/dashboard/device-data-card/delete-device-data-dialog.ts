import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Dialog } from '../../../../shared/ui/dialog/dialog';

@Component({
  selector: 'app-delete-device-data-dialog',
  imports: [Dialog],
  templateUrl: './delete-device-data-dialog.html',
  styleUrl: './delete-device-data-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteDeviceDataDialog {
  readonly deleting = input(false);
  readonly failed = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  private readonly confirm = viewChild.required<ElementRef<HTMLButtonElement>>('confirm');

  constructor() {
    afterRenderEffect(() => {
      if (this.failed() && !this.deleting()) {
        this.confirm().nativeElement.focus();
      }
    });
  }
}
