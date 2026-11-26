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
import { leaveWithClass } from '../../../../../shared/ui/leaving-row/leaving-row';
import { NeedsConnection } from '../../../../../shared/ui/needs-connection/needs-connection';

export type OfferedAccountAction = 'reconnect' | 'disconnect';

const FOLD = 'account-action-fold';
const OPENING = 'account-swap--opening';
const CLOSING = 'account-swap--closing';
const SETTLE_GRACE_MS = 300;

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

  protected readonly partLeaves = leaveWithClass(CLOSING);

  private readonly renderer = inject(Renderer2);
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;

  constructor() {
    afterRenderEffect(() => {
      this.confirming();
      this.returning();
      this.action();
      for (const swap of this.host.querySelectorAll<HTMLElement>(`.${OPENING}`)) {
        this.settle(swap);
      }
    });
  }

  private settle(swap: HTMLElement): void {
    if (!swap.classList.contains(OPENING) || swap.classList.contains(CLOSING)) {
      return;
    }
    const running = (swap.getAnimations?.() ?? []).filter(
      (motion) => motion.playState === 'running',
    );
    if (running.length > 0) {
      const longest = Math.max(
        0,
        ...running.map((motion) => Number(motion.effect?.getComputedTiming().endTime ?? 0)),
      );
      let looked = false;
      const lookAgain = (): void => {
        if (looked) {
          return;
        }
        looked = true;
        clearTimeout(fallback);
        this.settle(swap);
      };
      void Promise.allSettled(running.map((motion) => motion.finished)).then(lookAgain);
      const fallback = setTimeout(
        lookAgain,
        (Number.isFinite(longest) ? longest : 0) + SETTLE_GRACE_MS,
      );
      return;
    }
    this.renderer.removeClass(swap, OPENING);
    if (swap.classList.contains(FOLD)) {
      this.returned.emit();
    }
  }
}
