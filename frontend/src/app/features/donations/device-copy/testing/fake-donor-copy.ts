import { signal } from '@angular/core';
import type { IssuedReceipt } from '../../receipt-pdf/frozen-receipt';
import type { DonationListResponse, DonationSummaryResponse } from '../../donations-api';
import type { DonorCopy, SyncOutcome } from '../donor-copy';
import type { DonorCopyView } from '../donor-copy-view';

export const COPY_STORED_AT = '2026-10-18T08:06:00Z';

export class FakeDonorCopy implements DonorCopy {
  readonly opened = signal(true);
  readonly shown = signal<DonorCopyView | null>(null);
  readonly first = signal(false);
  readonly keeps = signal(true);
  readonly owned = signal<string | null>('jana');
  readonly open = this.opened.asReadonly();
  readonly view = this.shown.asReadonly();
  readonly firstSync = this.first.asReadonly();
  readonly keepsOnDevice = this.keeps.asReadonly();
  readonly owner = this.owned.asReadonly();
  readonly pending: ((outcome: SyncOutcome) => void)[] = [];
  readonly sync = vi.fn(() => this.next());
  readonly catchUp = vi.fn(() => this.next());

  private next(): Promise<SyncOutcome> {
    return new Promise((resolve) => this.pending.push(resolve));
  }

  finish(outcome: SyncOutcome, view?: DonorCopyView | null): void {
    if (view !== undefined) {
      this.shown.set(view);
    }
    for (const resolve of this.pending.splice(0)) {
      resolve(outcome);
    }
  }
}

export function copyViewOf(
  summary: DonationSummaryResponse,
  list: DonationListResponse,
  receipts: readonly IssuedReceipt[] = [],
  storedAt: string = COPY_STORED_AT,
): DonorCopyView {
  return {
    summary: { ...summary, bankDataAsOf: '2026-10-18T08:05:30Z' },
    items: list.items,
    receipts,
    images: [],
    agrees: true,
    storedAt,
  };
}
