import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { type ReceiptKeysResponse, trustedKeys, type TrustedKeys } from './receipt-keys';

const STORAGE_KEY = 'nfnn.receipt-keys';

export const RECEIPT_KEY_STORAGE = new InjectionToken<() => Storage>('RECEIPT_KEY_STORAGE', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    return () => {
      if (!view) {
        throw new Error('No window');
      }
      return view.localStorage;
    };
  },
});

@Injectable({ providedIn: 'root' })
export class ReceiptKeyStore {
  private readonly storage = inject(RECEIPT_KEY_STORAGE);
  private readonly hostname = inject(DOCUMENT).location.hostname;

  async stored(): Promise<TrustedKeys | null> {
    let kept: unknown;
    try {
      kept = JSON.parse(this.storage().getItem(STORAGE_KEY) ?? 'null');
    } catch {
      return null;
    }
    return this.trusted(kept);
  }

  trusted(list: unknown): Promise<TrustedKeys | null> {
    return trustedKeys(list, this.hostname);
  }

  replace(list: ReceiptKeysResponse): void {
    try {
      this.storage().setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      return;
    }
  }
}
