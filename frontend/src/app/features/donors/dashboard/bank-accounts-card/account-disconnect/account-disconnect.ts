import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { BankAccountItem } from '../../../../donations/bank-accounts-api';
import { Disclosure } from '../../../../../shared/ui/disclosure/disclosure';
import { NeedsConnection } from '../../../../../shared/ui/needs-connection/needs-connection';

export type OfferedAccountAction = 'reconnect' | 'disconnect';

const RETURNING = 'account-action-fold--returning';
const CLOSING = 'account-action-fold--closing';

@Component({
  selector: 'app-account-disconnect',
  imports: [Disclosure, NeedsConnection],
  templateUrl: './account-disconnect.html',
  styleUrl: './account-disconnect.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDisconnect {
  readonly account = input.required<BankAccountItem>();
  readonly buttonId = input.required<string>();
  readonly action = input<OfferedAccountAction | null>(null);
  readonly confirming = input(false);
  readonly returning = input(false);
  readonly busy = input(false);
  readonly symbols = input('');
  readonly reconnectRequested = output<void>();
  readonly disconnectAsked = output<void>();
  readonly disconnectConfirmed = output<void>();
  readonly disconnectKept = output<void>();
  readonly returned = output<void>();

  protected settle(event: TransitionEvent): void {
    const fold = event.currentTarget as HTMLElement;
    if (
      event.target === fold &&
      fold.classList.contains(RETURNING) &&
      !fold.classList.contains(CLOSING) &&
      fold.getAnimations().length === 0
    ) {
      this.returned.emit();
    }
  }
}
