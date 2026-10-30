import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, forkJoin, last, map, Observable, of, tap } from 'rxjs';
import { problemOf, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { BankAccountItem, BankAccountsApi } from '../../donations/bank-accounts-api';
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

export type BankCheckOutcome =
  | { readonly kind: 'found'; readonly count: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'unfinished' }
  | { readonly kind: 'failed' };

interface SavedReceipt {
  readonly key: string;
  readonly fileName: string;
}

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
const BANK_CHECK_COOLDOWN_MS = 30_000;

@Injectable()
export class DonorDonations {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly donations = inject(DonationsApi);
  private readonly bankAccountsApi = inject(BankAccountsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<DonationsState>('loading');
  readonly summary = signal<DonationSummaryResponse | null>(null);
  readonly items = signal<readonly DonationItem[]>([]);

  readonly years = computed(() => (this.summary()?.byYear ?? []).map((entry) => entry.year));
  readonly receiptsFrom = computed(() => this.summary()?.receiptsAvailableFrom ?? null);

  readonly bankDataAsOf = signal<string | null>(null);
  readonly checkingBank = signal(false);
  readonly bankCheckOutcome = signal<BankCheckOutcome | null>(null);
  readonly bankDataArrived = signal(0);

  readonly bankAccounts = signal<readonly BankAccountItem[]>([]);
  readonly accountsWithQuestion = computed(() =>
    this.bankAccounts().filter((account) => account.symbolOffer !== null),
  );

  readonly receiptError = signal<ReceiptError | null>(null);
  private readonly downloads = signal<ReadonlySet<string>>(new Set());
  private readonly savedReceipt = signal<SavedReceipt | null>(null);
  private latestDonationsRequest = 0;
  private bankCheckEndedAt: number | null = null;

  constructor() {
    this.load();
    this.checkBank(false);
    this.bankAccountsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items }) => this.bankAccounts.set(items),
        error: () => this.bankAccounts.set([]),
      });
  }

  showBankAccounts(items: readonly BankAccountItem[]): void {
    this.bankAccounts.set(items);
  }

  load(): void {
    this.state.set('loading');
    this.fetchDonations();
  }

  refreshFromBank(): void {
    this.checkBank(true);
  }

  checkBankIfStale(): void {
    const endedAt = this.bankCheckEndedAt;
    if (endedAt !== null && Date.now() - endedAt > BANK_CHECK_COOLDOWN_MS) {
      this.checkBank(false);
    }
  }

  clearBankCheckOutcome(): void {
    this.bankCheckOutcome.set(null);
  }

  bankCheckedWhileAdding(check: BankCheckResponse): void {
    const asOfBefore = this.bankDataAsOf();
    this.bankDataAsOf.set(check.bankDataAsOf);
    if (check.bankDataAsOf !== asOfBefore) {
      this.fetchDonations();
    }
  }

  fetchDonations(): void {
    this.reloadDonations().subscribe();
  }

  private reloadDonations(): Observable<readonly DonationItem[] | null> {
    const request = ++this.latestDonationsRequest;
    return forkJoin({ summary: this.donations.summary(), list: this.donations.list() }).pipe(
      map(({ summary, list }) => {
        if (request === this.latestDonationsRequest) {
          this.summary.set(summary);
          this.items.set(list.items);
          this.state.set('ready');
        }
        return list.items;
      }),
      catchError((failure: unknown) => {
        if (this.sessionEnded(failure)) {
          this.sendToSignIn();
        } else if (request === this.latestDonationsRequest) {
          this.state.set('error');
        }
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef),
    );
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

  yearlySaved(year: number): string | null {
    return this.savedText(yearlyKey(year));
  }

  singleSaved(item: DonationItem): string | null {
    return this.savedText(singleKey(item.id));
  }

  private savedText(key: string): string | null {
    const saved = this.savedReceipt();
    if (saved?.key !== key) {
      return null;
    }
    const fileName = saved.fileName;
    return $localize`:@@donor.dashboard.receipt.saved:Potvrzení ${fileName}:fileName: je stažené. Najdete ho ve stažených souborech.`;
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

  private checkBank(byDonor: boolean): void {
    if (this.checkingBank()) {
      return;
    }
    this.checkingBank.set(true);
    this.bankCheckOutcome.set(null);
    const known = new Set(this.items().map((item) => item.id));
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
          if (byDonor || check.bankDataAsOf !== asOfBefore) {
            this.bankDataArrived.update((count) => count + 1);
          }
          this.reloadDonations().subscribe((items) => {
            this.bankCheckEnded();
            if (byDonor && items !== null) {
              this.bankCheckOutcome.set(outcomeOf(check, items, known));
            }
          });
        },
        error: (failure: unknown) => {
          this.bankCheckEnded();
          if (!byDonor) {
            return;
          }
          if (this.sessionEnded(failure)) {
            this.sendToSignIn();
            return;
          }
          this.bankCheckOutcome.set({ kind: 'failed' });
        },
      });
  }

  private bankCheckEnded(): void {
    this.checkingBank.set(false);
    this.bankCheckEndedAt = Date.now();
  }

  private sessionEnded(failure: unknown): boolean {
    return problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous';
  }

  private download(key: string, scope: ReceiptScope, file$: Observable<DownloadedFile>): void {
    if (this.downloads().has(key)) {
      return;
    }
    this.receiptError.set(null);
    this.savedReceipt.set(null);
    this.downloads.update((running) => new Set(running).add(key));
    file$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (file) => {
        this.finishDownload(key);
        saveBlob(file);
        this.savedReceipt.set({ key, fileName: file.fileName });
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

function outcomeOf(
  check: BankCheckResponse,
  items: readonly DonationItem[],
  known: ReadonlySet<string>,
): BankCheckOutcome {
  if (check.checking) {
    return { kind: 'unfinished' };
  }
  const count = items.filter((item) => item.status === 'RECEIVED' && !known.has(item.id)).length;
  return count > 0 ? { kind: 'found', count } : { kind: 'none' };
}

function yearlyKey(year: number): string {
  return `yearly:${year}`;
}

function singleKey(donationId: string): string {
  return `single:${donationId}`;
}
