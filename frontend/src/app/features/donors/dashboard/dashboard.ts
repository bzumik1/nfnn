import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, Observable } from 'rxjs';
import { problemOf, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatCrowns } from '../../donations/donation-amount';
import { formatDonationDate } from '../../donations/donation-date';
import {
  DonationItem,
  DonationsApi,
  DonationStatus,
  DonationSummaryResponse,
  DownloadedFile,
} from '../../donations/donations-api';
import { saveBlob } from '../../donations/file-download';

type DashboardState = 'loading' | 'ready' | 'error';

type ReceiptScope = 'yearly' | 'single';

interface ReceiptError {
  readonly scope: ReceiptScope;
  readonly message: string;
}

const STATUS_LABELS: Record<DonationStatus, string> = {
  RECEIVED: $localize`:@@donor.dashboard.payments.status.received:Přijato`,
  REFUNDED: $localize`:@@donor.dashboard.payments.status.refunded:Vráceno`,
};

const RECEIPT_FAILED = $localize`:@@donor.dashboard.receipt.error:Potvrzení se nepodařilo stáhnout. Zkuste to prosím znovu.`;

const MINOR_UNITS_PER_CROWN = 100;
const UNAUTHENTICATED = 'auth/unauthenticated';
const YEARLY_PROBLEMS_SHOWN_AS_TITLE = ['donations/year-not-yet-completed', 'donations/yearly-receipt-not-available'];
const NOT_FOUND = 404;

@Component({
  selector: 'app-donor-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DonorDashboard {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly donations = inject(DonationsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly donor = this.auth.donor;

  protected readonly state = signal<DashboardState>('loading');
  protected readonly summary = signal<DonationSummaryResponse | null>(null);
  protected readonly items = signal<readonly DonationItem[]>([]);

  protected readonly years = computed(() => (this.summary()?.byYear ?? []).map((entry) => entry.year));

  protected readonly selectedYear = linkedSignal<number | null>(() => this.years()[0] ?? null);

  protected readonly selectedYearTotal = computed(
    () => this.summary()?.byYear.find((entry) => entry.year === this.selectedYear()) ?? null,
  );

  protected readonly selectedYearCompleted = computed(() => {
    const year = this.selectedYear();
    const availableThrough = this.summary()?.yearlyReceiptsAvailableThrough;
    return year !== null && availableThrough !== undefined && year <= availableThrough;
  });

  protected readonly receiptError = signal<ReceiptError | null>(null);
  private readonly downloads = signal<ReadonlySet<string>>(new Set());
  protected readonly signingOut = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.fetchDonations();
  }

  private fetchDonations(): void {
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

  private sessionEnded(failure: unknown): boolean {
    return problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous';
  }

  private sendToSignIn(): void {
    this.loginDialog.open();
    void this.router.navigateByUrl('/');
  }

  protected crowns(amountMinor: number): string {
    return formatCrowns(amountMinor / MINOR_UNITS_PER_CROWN);
  }

  protected formatDate(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected statusLabel(status: DonationStatus): string {
    return STATUS_LABELS[status];
  }

  protected selectYear(year: number): void {
    this.selectedYear.set(year);
    if (this.receiptError()?.scope === 'yearly') {
      this.receiptError.set(null);
    }
  }

  protected yearlyDownloading(year: number): boolean {
    return this.downloads().has(yearlyKey(year));
  }

  protected singleDownloading(item: DonationItem): boolean {
    return this.downloads().has(singleKey(item.id));
  }

  protected downloadYearlyReceipt(): void {
    const year = this.selectedYear();
    if (year === null || !this.selectedYearCompleted()) {
      return;
    }
    this.download(yearlyKey(year), 'yearly', this.donations.yearlyReceipt(year));
  }

  protected downloadSingleReceipt(item: DonationItem): void {
    this.download(singleKey(item.id), 'single', this.donations.singleReceipt(item.id));
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
    if (scope === 'yearly' && YEARLY_PROBLEMS_SHOWN_AS_TITLE.some((type) => problemTypeEndsWith(failure, type))) {
      this.receiptError.set({ scope, message: problem?.title || RECEIPT_FAILED });
      return;
    }
    if (scope === 'single' && problem?.status === NOT_FOUND) {
      this.receiptError.set({ scope, message: problem.title || RECEIPT_FAILED });
      this.fetchDonations();
      return;
    }
    this.receiptError.set({ scope, message: RECEIPT_FAILED });
  }

  protected logout(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/'));
  }
}

function yearlyKey(year: number): string {
  return `yearly:${year}`;
}

function singleKey(donationId: string): string {
  return `single:${donationId}`;
}
