import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { PaymentAccountState } from '../../../donations/payment-panel/payment-panel';
import { PaymentQrApi } from '../../../donations/payment-qr-api';

type OwnAccountState = PaymentAccountState | { readonly kind: 'idle' };

const SAMPLE_AMOUNT = 100;

let nextId = 0;

@Component({
  selector: 'app-standing-order',
  imports: [RouterLink, CopyButton],
  templateUrl: './standing-order.html',
  styleUrl: './standing-order.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingOrder {
  private readonly paymentQr = inject(PaymentQrApi);

  readonly variableSymbol = input.required<string>();
  readonly account = input<PaymentAccountState | null>(null);
  readonly retryRequested = output<void>();

  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggleButton');

  private readonly id = ++nextId;
  protected readonly toggleId = `standing-order-toggle-${this.id}`;
  protected readonly panelId = `standing-order-${this.id}`;
  protected readonly open = signal(false);
  private readonly ownAccount = signal<OwnAccountState>({ kind: 'idle' });
  protected readonly shownAccount = computed<OwnAccountState>(
    () => this.account() ?? this.ownAccount(),
  );

  protected toggle(): void {
    this.open.update((open) => !open);
    if (this.open() && this.account() === null && this.ownAccount().kind !== 'ready') {
      this.loadAccount();
    }
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
    this.ownAccount.set({ kind: 'loading' });
    this.paymentQr.paymentQr(SAMPLE_AMOUNT, null).subscribe({
      next: ({ bankAccount }) => this.ownAccount.set({ kind: 'ready', account: bankAccount }),
      error: () => this.ownAccount.set({ kind: 'failed' }),
    });
  }
}
