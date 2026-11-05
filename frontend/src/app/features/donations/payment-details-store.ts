import { DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import {
  PaymentDetails,
  PaymentDetailsApi,
  paymentDetailsOf,
  WrittenPaymentDetails,
} from './payment-details-api';

export type PaymentDetailsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly details: PaymentDetails }
  | { readonly kind: 'failed' };

export interface PaymentDetailsAge {
  readonly writtenAt: number | null;
  readonly kept: boolean;
}

export const KEPT_PAYMENT_DETAILS = 'nfnn.payment-details';

const KEPT_FOR_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PaymentDetailsStore {
  private readonly api = inject(PaymentDetailsApi);
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<PaymentDetailsState>({ kind: 'loading' });
  private readonly currentAge = signal<PaymentDetailsAge | null>(null);
  private requested = false;
  private checking = false;
  private loadedAt = 0;

  readonly state = this.current.asReadonly();
  readonly age = this.currentAge.asReadonly();

  constructor() {
    const checkWhenVisible = () => {
      if (this.document.visibilityState === 'visible') {
        this.checkIfOld();
      }
    };
    this.document.addEventListener('visibilitychange', checkWhenVisible);
    inject(DestroyRef).onDestroy(() =>
      this.document.removeEventListener('visibilitychange', checkWhenVisible),
    );
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
      performance.now() - this.loadedAt < KEPT_FOR_MS
    ) {
      return;
    }
    this.checking = true;
    this.api.details({ pastBrowserCache: true }).subscribe({
      next: (written) => this.hold(written),
      error: () => {
        this.checking = false;
      },
    });
  }

  private fetch(pastBrowserCache: boolean): void {
    this.requested = true;
    this.current.set({ kind: 'loading' });
    this.api.details({ pastBrowserCache }).subscribe({
      next: (written) => this.hold(written),
      error: () => this.fallBack(),
    });
  }

  private hold(written: WrittenPaymentDetails): void {
    this.checking = false;
    this.loadedAt = performance.now();
    this.show(written.details);
    this.currentAge.set({ writtenAt: written.writtenAt, kept: false });
    this.keep(written);
  }

  private fallBack(): void {
    const kept = this.kept();
    if (kept === null) {
      this.current.set({ kind: 'failed' });
      return;
    }
    this.show(kept.details);
    this.currentAge.set({ writtenAt: kept.writtenAt, kept: true });
  }

  private show(details: PaymentDetails): void {
    const held = this.current();
    if (held.kind !== 'ready' || JSON.stringify(held.details) !== JSON.stringify(details)) {
      this.current.set({ kind: 'ready', details });
    }
  }

  private keep(written: WrittenPaymentDetails): void {
    try {
      this.storage()?.setItem(KEPT_PAYMENT_DETAILS, JSON.stringify(written));
    } catch {
      return;
    }
  }

  private kept(): WrittenPaymentDetails | null {
    try {
      const text = this.storage()?.getItem(KEPT_PAYMENT_DETAILS);
      if (text === null || text === undefined) {
        return null;
      }
      const stored = JSON.parse(text) as { details?: unknown; writtenAt?: unknown };
      const writtenAt = stored.writtenAt;
      return {
        details: paymentDetailsOf(stored.details),
        writtenAt: typeof writtenAt === 'number' && Number.isFinite(writtenAt) ? writtenAt : null,
      };
    } catch {
      return null;
    }
  }

  private storage(): Storage | undefined {
    return this.document.defaultView?.localStorage;
  }
}
