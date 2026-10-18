import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { formatDonationDate } from '../../donations/donation-date';
import {
  DonationItem,
  DonationsApi,
  DonationStatus,
  DonationSummaryResponse,
} from '../../donations/donations-api';
import {
  Receipt,
  ReceiptInput,
  ReceiptPayment,
  ReceiptUser,
} from '../../donations/receipt/receipt';

type DashboardState = 'loading' | 'ready' | 'error';

const STATUS_LABELS: Record<DonationStatus, string> = {
  RECEIVED: $localize`:@@donor.dashboard.payments.status.received:Přijato`,
  REFUNDED: $localize`:@@donor.dashboard.payments.status.refunded:Vráceno`,
};

const MINOR_UNITS_PER_CROWN = 100;

@Component({
  selector: 'app-donor-dashboard',
  imports: [Receipt, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DonorDashboard {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly donations = inject(DonationsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly donor = this.auth.donor;

  protected readonly user = computed<ReceiptUser>(() => ({
    name: this.donor()?.name ?? '',
    email: this.donor()?.email ?? '',
  }));

  protected readonly state = signal<DashboardState>('loading');
  protected readonly summary = signal<DonationSummaryResponse | null>(null);
  protected readonly items = signal<readonly DonationItem[]>([]);

  protected readonly years = computed(() => (this.summary()?.byYear ?? []).map((entry) => entry.year));

  protected readonly selectedYear = linkedSignal<number | null>(() => this.years()[0] ?? null);

  protected readonly selectedYearTotal = computed(
    () => this.summary()?.byYear.find((entry) => entry.year === this.selectedYear()) ?? null,
  );

  protected readonly selectedReceipt = signal<ReceiptInput | null>(null);
  protected readonly signingOut = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    forkJoin({ summary: this.donations.summary(), list: this.donations.list() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ summary, list }) => {
          this.summary.set(summary);
          this.items.set(list.items);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  protected crowns(amountMinor: number): string {
    return this.formatAmount(amountMinor / MINOR_UNITS_PER_CROWN);
  }

  protected formatAmount(value: number): string {
    return value.toLocaleString('cs-CZ');
  }

  protected formatDate(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected statusLabel(status: DonationStatus): string {
    return STATUS_LABELS[status];
  }

  protected selectYear(year: number): void {
    this.selectedYear.set(year);
  }

  protected openYearReceipt(): void {
    const year = this.selectedYear();
    const yearTotal = this.selectedYearTotal();
    if (year === null || yearTotal === null) {
      return;
    }
    const payments = this.items()
      .filter((item) => item.status === 'RECEIVED' && item.receivedAt.startsWith(`${year}-`))
      .map((item) => this.toReceiptPayment(item));
    this.selectedReceipt.set({
      kind: 'summary',
      summary: {
        year: String(year),
        total: yearTotal.totalAmountMinor / MINOR_UNITS_PER_CROWN,
        payments,
      },
    });
  }

  protected openSingleReceipt(item: DonationItem): void {
    this.selectedReceipt.set({ kind: 'single', payment: this.toReceiptPayment(item) });
  }

  protected closeReceipt(): void {
    this.selectedReceipt.set(null);
  }

  protected logout(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/'));
  }

  protected contributionsLabel(count: number): string {
    if (count === 1) return 'příspěvek';
    if (count < 5) return 'příspěvky';
    return 'příspěvků';
  }

  private toReceiptPayment(item: DonationItem): ReceiptPayment {
    return {
      id: item.receiptNumber ?? item.id,
      date: formatDonationDate(item.receivedAt),
      amount: item.amountMinor / MINOR_UNITS_PER_CROWN,
      purpose: item.purpose,
      status: STATUS_LABELS[item.status],
    };
  }
}
