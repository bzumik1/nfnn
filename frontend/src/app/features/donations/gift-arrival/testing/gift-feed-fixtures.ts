import { signal } from '@angular/core';
import { Observable } from 'rxjs';
import { DonationItem } from '../../donations-api';
import { GiftFeed } from '../gift-feed';

export class FakeGiftFeed implements GiftFeed {
  readonly gifts = signal<readonly DonationItem[] | null>(null);
  readonly asking = signal(false);
  loads = 0;
  asks = 0;
  following = 0;

  constructor(readonly listedHere = false) {}

  requestGifts(): void {
    this.loads++;
  }

  follow(): Observable<unknown> {
    return new Observable(() => {
      this.following++;
      return () => this.following--;
    });
  }

  askBank(): void {
    this.asks++;
  }
}

export function giftItem(id: string, overrides: Partial<DonationItem> = {}): DonationItem {
  return {
    id,
    receiptNumber: null,
    receivedAt: '2026-11-06T10:00:00Z',
    amountMinor: 50_000,
    currency: 'CZK',
    purpose: 'Dar',
    status: 'RECEIVED',
    source: 'BANK_TRANSFER',
    pairedBy: 'VARIABLE_SYMBOL',
    senderAccount: null,
    confirmedSymbol: null,
    accountVerification: false,
    receiptAvailable: true,
    ...overrides,
  };
}
