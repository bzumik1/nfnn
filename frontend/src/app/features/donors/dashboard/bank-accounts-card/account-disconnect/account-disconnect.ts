import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  Renderer2,
} from '@angular/core';
import { BankAccountItem } from '../../../../donations/bank-accounts-api';
import { Disclosure } from '../../../../../shared/ui/disclosure/disclosure';
import { NeedsConnection } from '../../../../../shared/ui/needs-connection/needs-connection';

export type OfferedAccountAction = 'reconnect' | 'disconnect';

const FOLD = 'account-action-fold';
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

  readonly returned = output<void>();

  private readonly renderer = inject(Renderer2);
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;

  constructor() {
    afterRenderEffect(() => {
      this.confirming();
      this.returning();
      this.action();
      for (const swap of this.host.querySelectorAll<HTMLElement>(`.${OPENING}`)) {
        const motions = swap.getAnimations?.() ?? [];
        void Promise.allSettled(motions.map((motion) => motion.finished)).then(() =>
          this.settle(swap),
        );
      }
    });
  }

  private settle(swap: HTMLElement): void {
    const moving = swap.getAnimations?.() ?? [];
    if (
      !swap.classList.contains(OPENING) ||
      swap.classList.contains(CLOSING) ||
      moving.some((motion) => motion.playState === 'running')
    ) {
      return;
    }
    this.renderer.removeClass(swap, OPENING);
    if (swap.classList.contains(FOLD)) {
      this.returned.emit();
    }
  }
}
