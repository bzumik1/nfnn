import { DestroyRef, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, finalize, last, Observable, switchMap, tap } from 'rxjs';
import { LiveUpdates } from '../../../core/live/live-updates';
import { DonorDonationsRepository } from '../device-copy/donor-donations-repository';
import { DonationItem, DonationsApi } from '../donations-api';
import { GiftFeed } from './gift-feed';

@Injectable()
export class RepositoryGiftFeed implements GiftFeed {
  private readonly repository = inject(DonorDonationsRepository);
  private readonly donations = inject(DonationsApi);
  private readonly live = inject(LiveUpdates);
  private readonly destroyRef = inject(DestroyRef);
  private readonly latest = signal<readonly DonationItem[] | null>(null);
  private readonly checking = signal(false);

  readonly gifts = this.latest.asReadonly();
  readonly asking = this.checking.asReadonly();
  readonly listedHere = false;

  requestGifts(): void {
    const held = untracked(this.repository.held);
    if (held !== null) {
      this.latest.set(held.items);
      return;
    }
    this.read().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  follow(): Observable<unknown> {
    return this.live.changes(['donations']).pipe(switchMap(() => this.read()));
  }

  askBank(): void {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    this.donations
      .checkBankUntilDone()
      .pipe(
        last(),
        switchMap(() => (this.live.connected() ? EMPTY : this.read())),
        catchError(() => EMPTY),
        finalize(() => this.checking.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private read(): Observable<unknown> {
    return this.repository.fresh('sync').pipe(
      tap((read) => this.latest.set(read.items)),
      catchError(() => EMPTY),
    );
  }
}
