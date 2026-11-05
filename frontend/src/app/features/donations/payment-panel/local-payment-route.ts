import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { ExternalNavigation } from '../../../core/navigation/external-navigation';

const PAYMENT_ROUTE = '/platba.spayd';
const RESERVATION = 'nfnn-payment-file';
const RESERVATION_TIMEOUT_MS = 2_000;
const RESERVATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

@Injectable({ providedIn: 'root' })
export class LocalPaymentRoute {
  private readonly document = inject(DOCUMENT);
  private readonly navigation = inject(ExternalNavigation);

  reserve(spaydText: string): Promise<string | null> {
    const worker = this.document.defaultView?.navigator.serviceWorker?.controller;
    if (!worker) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const settle = (id: string | null): void => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(id);
      };
      const timer = setTimeout(() => settle(null), RESERVATION_TIMEOUT_MS);
      channel.port1.onmessage = (event: MessageEvent<unknown>) => settle(reservationId(event.data));
      worker.postMessage({ type: RESERVATION, payment: spaydText }, [channel.port2]);
    });
  }

  open(id: string): void {
    this.navigation.assign(`${PAYMENT_ROUTE}?${new URLSearchParams({ id })}`);
  }
}

function reservationId(reply: unknown): string | null {
  if (typeof reply !== 'object' || reply === null) {
    return null;
  }
  const { type, id } = reply as { type?: unknown; id?: unknown };
  return type === RESERVATION && typeof id === 'string' && RESERVATION_ID.test(id) ? id : null;
}
