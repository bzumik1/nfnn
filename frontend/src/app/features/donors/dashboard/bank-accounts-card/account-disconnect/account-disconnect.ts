import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  Renderer2,
} from '@angular/core';
import { BankAccountItem } from '../../../../donations/bank-accounts-api';
import { Disclosure } from '../../../../../shared/ui/disclosure/disclosure';
import { NeedsConnection } from '../../../../../shared/ui/needs-connection/needs-connection';

export type OfferedAccountAction = 'reconnect' | 'disconnect';

const OPENING = 'account-swap--opening';
const CLOSING = 'account-swap--closing';

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

  private readonly renderer = inject(Renderer2);

  protected settle(event: TransitionEvent): void {
    const swap = event.currentTarget as HTMLElement;
    if (
      event.target === swap &&
      swap.classList.contains(OPENING) &&
      !swap.classList.contains(CLOSING) &&
      swap.getAnimations().length === 0
    ) {
      this.renderer.removeClass(swap, OPENING);
    }
  }
}
