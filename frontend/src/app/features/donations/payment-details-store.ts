import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { PaymentDetails, PaymentDetailsApi } from './payment-details-api';

export type PaymentDetailsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly details: PaymentDetails }
  | { readonly kind: 'failed' };

const KEPT_FOR_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PaymentDetailsStore {
  private readonly api = inject(PaymentDetailsApi);
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<PaymentDetailsState>({ kind: 'loading' });
  private requested = false;
  private checking = false;
  private loadedAt = 0;

  readonly state = this.current.asReadonly();

  constructor() {
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') {
        this.checkIfOld();
      }
    });
  }

  load(): void {
    if (!this.requested || this.current().kind === 'failed') {
      this.fetch(false);
      return;
    }
    this.checkIfOld();
  }

  reload(): void {
    this.fetch(true);
  }

  private checkIfOld(): void {
    if (
      this.current().kind !== 'ready' ||
      this.checking ||
      Date.now() - this.loadedAt < KEPT_FOR_MS
    ) {
      return;
    }
    this.checking = true;
    this.api.details({ pastBrowserCache: true }).subscribe({
      next: (details) => this.hold(details),
      error: () => {
        this.checking = false;
      },
    });
  }

  private fetch(pastBrowserCache: boolean): void {
    this.requested = true;
    this.current.set({ kind: 'loading' });
    this.api.details({ pastBrowserCache }).subscribe({
      next: (details) => this.hold(details),
      error: () => this.current.set({ kind: 'failed' }),
    });
  }

  private hold(details: PaymentDetails): void {
    this.checking = false;
    this.loadedAt = Date.now();
    const held = this.current();
    if (held.kind !== 'ready' || JSON.stringify(held.details) !== JSON.stringify(details)) {
      this.current.set({ kind: 'ready', details });
    }
  }
}
