import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { BusyLabel } from '../../../shared/ui/busy-label/busy-label';

@Component({
  selector: 'app-bank-logo-remove-dialog',
  imports: [BusyLabel, Dialog, NeedsConnection],
  templateUrl: './bank-logo-remove-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankLogoRemoveDialog {
  readonly code = input.required<string>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
