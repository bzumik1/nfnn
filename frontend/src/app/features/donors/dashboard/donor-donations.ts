import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin, last, Observable, tap } from 'rxjs';
import { problemOf, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import {
  BankCheckResponse,
  DonationItem,
  DonationsApi,
  DonationSummaryResponse,
  DownloadedFile,
} from '../../donations/donations-api';
import { saveBlob } from '../../donations/file-download';

export type DonationsState = 'loading' | 'ready' | 'error';

export type ReceiptScope = 'yearly' | 'single';

export interface ReceiptError {
  readonly scope: ReceiptScope;
  readonly message: string;
}

const RECEIPT_FAILED = $localize`:@@donor.dashboard.receipt.error:Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu.`;

const UNAUTHENTICATED = 'auth/unauthenticated';
const RECEIPT_BEFORE_FIRST_YEAR = 'donations/receipt-before-first-year';
const YEARLY_PROBLEMS_SHOWN_AS_TITLE = [
  'donations/year-not-yet-completed',
  'donations/yearly-receipt-not-available',
  RECEIPT_BEFORE_FIRST_YEAR,
];
const NOT_FOUND = 404;

@Injectable()
export class DonorDonations {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly donations = inject(DonationsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<DonationsState>('loading');
  readonly summary = signal<DonationSummaryResponse | null>(null);
  readonly items = signal<readonly DonationItem[]>([]);

  readonly years = computed(() => (this.summary()?.byYear ?? []).map((entry) => entry.year));
  readonly receiptsFrom = computed(() => this.summary()?.receiptsAvailableFrom ?? null);

  readonly bankDataAsOf = signal<string | null>(null);
  readonly checkingBank = signal(false);
  readonly bankDataArrived = signal(0);

  readonly receiptError = signal<ReceiptError | null>(null);
  private readonly downloads = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.load();
    this.checkBank(false);
  }

  load(): void {
    this.state.set('loading');
    this.fetchDonations();
  }

  refreshFromBank(): void {
    this.checkBank(true);
  }

  bankCheckedWhileAdding(check: BankCheckResponse): void {
    const asOfBefore = this.bankDataAsOf();
    this.bankDataAsOf.set(check.bankDataAsOf);
    if (check.bankDataAsOf !== asOfBefore) {
      this.fetchDonations();
    }
  }

  fetchDonations(): void {
    forkJoin({ summary: this.donations.summary(), list: this.donations.list() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ summary, list }) => {
          this.summary.set(summary);
          this.items.set(list.items);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (this.sessionEnded(failure)) {
            this.sendToSignIn();
            return;
          }
          this.state.set('error');
        },
      });
  }

  sendToSignIn(): void {
    this.loginDialog.open('login', { returnTo: this.router.url });
    void this.router.navigateByUrl('/');
  }

  clearReceiptError(scope: ReceiptScope): void {
    if (this.receiptError()?.scope === scope) {
      this.receiptError.set(null);
    }
  }

  yearlyDownloading(year: number): boolean {
    return this.downloads().has(yearlyKey(year));
  }

  singleDownloading(item: DonationItem): boolean {
    return this.downloads().has(singleKey(item.id));
  }

  downloadYearlyReceipt(year: number): void {
    this.download(yearlyKey(year), 'yearly', this.donations.yearlyReceipt(year));
  }

  downloadSingleReceipt(item: DonationItem): void {
    if (!item.receiptAvailable) {
      return;
    }
    this.download(singleKey(item.id), 'single', this.donations.singleReceipt(item.id));
  }

  private checkBank(reloadAlways: boolean): void {
    if (this.checkingBank()) {
      return;
    }
    this.checkingBank.set(true);
    let asOfBefore: string | null | undefined;
    this.donations
      .checkBankUntilDone()
      .pipe(
        tap((check) => {
          asOfBefore ??= check.bankDataAsOf;
          this.bankDataAsOf.set(check.bankDataAsOf);
        }),
        last(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (check: BankCheckResponse) => {
          this.checkingBank.set(false);
          if (reloadAlways || check.bankDataAsOf !== asOfBefore) {
            this.fetchDonations();
            this.bankDataArrived.update((count) => count + 1);
          }
        },
        error: () => this.checkingBank.set(false),
      });
  }

  private sessionEnded(failure: unknown): boolean {
    return problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous';
  }

  private download(key: string, scope: ReceiptScope, file$: Observable<DownloadedFile>): void {
    if (this.downloads().has(key)) {
      return;
    }
    this.receiptError.set(null);
    this.downloads.update((running) => new Set(running).add(key));
    file$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (file) => {
        this.finishDownload(key);
        saveBlob(file);
      },
      error: (failure: unknown) => {
        this.finishDownload(key);
        this.receiptFailed(scope, failure);
      },
    });
  }

  private finishDownload(key: string): void {
    this.downloads.update((running) => {
      const remaining = new Set(running);
      remaining.delete(key);
      return remaining;
    });
  }

  private receiptFailed(scope: ReceiptScope, failure: unknown): void {
    if (this.sessionEnded(failure)) {
      this.sendToSignIn();
      return;
    }
    const problem = problemOf(failure);
    if (
      scope === 'yearly' &&
      YEARLY_PROBLEMS_SHOWN_AS_TITLE.some((type) => problemTypeEndsWith(failure, type))
    ) {
      this.receiptError.set({ scope, message: problem?.title || RECEIPT_FAILED });
      return;
    }
    const rowOutdated =
      problem?.status === NOT_FOUND || problemTypeEndsWith(failure, RECEIPT_BEFORE_FIRST_YEAR);
    if (scope === 'single' && rowOutdated) {
      this.receiptError.set({ scope, message: problem?.title || RECEIPT_FAILED });
      this.fetchDonations();
      return;
    }
    this.receiptError.set({ scope, message: RECEIPT_FAILED });
  }
}

function yearlyKey(year: number): string {
  return `yearly:${year}`;
}

function singleKey(donationId: string): string {
  return `single:${donationId}`;
}
