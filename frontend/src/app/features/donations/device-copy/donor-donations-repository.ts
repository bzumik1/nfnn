import { computed, inject, Injectable, untracked } from '@angular/core';
import { defer, forkJoin, from, map, Observable, of, switchMap } from 'rxjs';
import { DonationItem, DonationsApi, DonationSummaryResponse } from '../donations-api';
import { DonorCopyLink } from './donor-copy';
import type { DonorCopyView } from './donor-copy-view';

export type DonationsFreshness = 'catch-up' | 'sync';

export interface DonorDonationsRead {
  readonly source: 'copy' | 'server';
  readonly owner: string | null;
  readonly summary: DonationSummaryResponse;
  readonly items: readonly DonationItem[];
  readonly at: string;
  readonly bankDataAsOf: string | null;
}

@Injectable({ providedIn: 'root' })
export class DonorDonationsRepository {
  private readonly link = inject(DonorCopyLink);
  private readonly api = inject(DonationsApi);

  private readonly copy = computed(() => {
    const copy = this.link.copy();
    return copy !== null && copy.open() ? copy : null;
  });

  readonly view = computed<DonorCopyView | null>(() => {
    const view = this.copy()?.view() ?? null;
    return view !== null && view.agrees ? view : null;
  });

  readonly held = computed<DonorDonationsRead | null>(() => {
    const view = this.view();
    return view === null
      ? null
      : {
          source: 'copy',
          owner: this.copy()?.owner() ?? null,
          summary: view.summary,
          items: view.items,
          at: view.storedAt,
          bankDataAsOf: view.summary.bankDataAsOf,
        };
  });

  fresh(freshness: DonationsFreshness): Observable<DonorDonationsRead> {
    const copy = untracked(this.copy);
    if (copy === null) {
      return this.fromServer();
    }
    if (untracked(this.held) === null) {
      void copy.catchUp();
      return this.fromServer();
    }
    return defer(() => from(freshness === 'catch-up' ? copy.catchUp() : copy.sync())).pipe(
      switchMap((outcome) => {
        const held = untracked(this.held);
        return outcome === 'stored' && held !== null ? of(held) : this.fromServer();
      }),
    );
  }

  private fromServer(): Observable<DonorDonationsRead> {
    return forkJoin({ summary: this.api.summary(), list: this.api.list() }).pipe(
      map(({ summary, list }) => ({
        source: 'server' as const,
        owner: null,
        summary,
        items: list.items,
        at: new Date().toISOString(),
        bankDataAsOf: null,
      })),
    );
  }
}
