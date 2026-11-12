import { InjectionToken, Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { DonationItem } from '../donations-api';

export interface GiftFeed {
  readonly gifts: Signal<readonly DonationItem[] | null>;
  readonly asking: Signal<boolean>;
  readonly listedHere: boolean;
  requestGifts(): Observable<readonly DonationItem[]>;
  follow(): Observable<unknown>;
  askBank(): void;
}

export const GIFT_FEED = new InjectionToken<GiftFeed>('GIFT_FEED');
