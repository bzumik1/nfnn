import { inject, Injectable, signal } from '@angular/core';
import { PaymentDetails, PaymentDetailsApi } from './payment-details-api';

export type PaymentDetailsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly details: PaymentDetails }
  | { readonly kind: 'failed' };

@Injectable({ providedIn: 'root' })
export class PaymentDetailsStore {
  private readonly api = inject(PaymentDetailsApi);
  private readonly current = signal<PaymentDetailsState>({ kind: 'loading' });
  private requested = false;

  readonly state = this.current.asReadonly();

  load(): void {
    if (this.requested && this.current().kind !== 'failed') {
      return;
    }
    this.requested = true;
    this.current.set({ kind: 'loading' });
    this.api.details().subscribe({
      next: (details) => this.current.set({ kind: 'ready', details }),
      error: () => this.current.set({ kind: 'failed' }),
    });
  }
}
