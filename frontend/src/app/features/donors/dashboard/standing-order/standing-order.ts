import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';
import { BankAccountResponse, PaymentQrApi } from '../../../donations/payment-qr-api';

type AccountState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly account: BankAccountResponse }
  | { readonly kind: 'failed' };

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

  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggleButton');

  private readonly id = ++nextId;
  protected readonly toggleId = `standing-order-toggle-${this.id}`;
  protected readonly panelId = `standing-order-${this.id}`;
  protected readonly open = signal(false);
  protected readonly account = signal<AccountState>({ kind: 'idle' });

  protected toggle(): void {
    this.open.update((open) => !open);
    if (this.open() && this.account().kind !== 'ready') {
      this.loadAccount();
    }
  }

  protected close(): void {
    this.open.set(false);
    this.toggleButton().nativeElement.focus();
  }

  private loadAccount(): void {
    this.account.set({ kind: 'loading' });
    this.paymentQr.paymentQr(SAMPLE_AMOUNT, null).subscribe({
      next: ({ bankAccount }) => this.account.set({ kind: 'ready', account: bankAccount }),
      error: () => this.account.set({ kind: 'failed' }),
    });
  }
}
