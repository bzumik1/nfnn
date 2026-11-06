import { Injectable, signal, type Signal } from '@angular/core';
import type { DonorCopyView } from './donor-copy-view';

export type SyncOutcome = 'stored' | 'failed' | 'mismatch' | 'no-copy';

export interface DonorCopy {
  readonly open: Signal<boolean>;
  readonly owner: Signal<string | null>;
  readonly view: Signal<DonorCopyView | null>;
  readonly firstSync: Signal<boolean>;
  readonly keepsOnDevice: Signal<boolean>;
  sync(): Promise<SyncOutcome>;
  catchUp(): Promise<SyncOutcome>;
}

@Injectable({ providedIn: 'root' })
export class DonorCopyLink {
  readonly copy = signal<DonorCopy | null>(null);
}
