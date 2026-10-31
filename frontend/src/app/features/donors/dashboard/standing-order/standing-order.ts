import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { formatCrowns } from '../../../donations/donation-amount';
import { PaymentAccountState } from '../../../donations/payment-panel/payment-panel';
import { PaymentDetailsStore } from '../../../donations/payment-details-store';

type OwnAccountState = PaymentAccountState | { readonly kind: 'idle' };

let nextId = 0;

@Component({
  selector: 'app-standing-order',
  imports: [RouterLink, CopyButton],
  templateUrl: './standing-order.html',
  styleUrl: './standing-order.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingOrder {
  private readonly paymentDetails = inject(PaymentDetailsStore);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly variableSymbol = input.required<string>();
  readonly account = input<PaymentAccountState | null>(null);
  readonly amount = input<number | null>(null);
  readonly retryRequested = output<void>();

  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggleButton');

  private readonly id = ++nextId;
  protected readonly toggleId = `standing-order-toggle-${this.id}`;
  protected readonly panelId = `standing-order-${this.id}`;
  protected readonly open = signal(false);
  private readonly ownAccountWanted = signal(false);
  private readonly ownAccount = computed<OwnAccountState>(() => {
    if (!this.ownAccountWanted()) {
      return { kind: 'idle' };
    }
    const state = this.paymentDetails.state();
    return state.kind === 'ready' ? { kind: 'ready', account: state.details.account } : state;
  });
  protected readonly shownAccount = computed<OwnAccountState>(
    () => this.account() ?? this.ownAccount(),
  );
  protected readonly chosenAmount = computed(() => {
    const amount = this.amount();
    return amount === null ? null : formatCrowns(amount);
  });

  protected toggle(): void {
    this.open.update((open) => !open);
    if (!this.open()) {
      return;
    }
    if (this.account() === null && this.ownAccount().kind !== 'ready') {
      this.loadAccount();
    }
    afterNextRender(() => this.host.nativeElement.scrollIntoView?.({ block: 'nearest' }), {
      injector: this.injector,
    });
  }

  protected close(): void {
    this.open.set(false);
    this.toggleButton().nativeElement.focus();
  }

  protected retry(): void {
    if (this.account() === null) {
      this.loadAccount();
    } else {
      this.retryRequested.emit();
    }
  }

  private loadAccount(): void {
    this.ownAccountWanted.set(true);
    this.paymentDetails.load();
  }
}
