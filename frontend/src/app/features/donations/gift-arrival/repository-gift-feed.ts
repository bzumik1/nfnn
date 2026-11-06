import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, finalize, last, map, Observable, switchMap, tap } from 'rxjs';
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

  requestGifts(): Observable<readonly DonationItem[]> {
    return this.read();
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

  private read(): Observable<readonly DonationItem[]> {
    return this.repository.fresh('sync').pipe(
      map((read) => read.items),
      tap((items) => this.latest.set(items)),
      catchError(() => EMPTY),
    );
  }
}
