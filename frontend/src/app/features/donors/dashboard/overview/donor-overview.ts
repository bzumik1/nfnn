import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { BankAccountItem, BankAccountsApi } from '../../../donations/bank-accounts-api';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../../donations/donation-date';
import { DonationsPending } from '../donations-pending/donations-pending';
import { DonationsTable } from '../donations-table/donations-table';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';
import { SymbolCard } from '../symbol-card/symbol-card';

const RECENT_DONATIONS_SHOWN = 5;

@Component({
  selector: 'app-donor-overview',
  imports: [NgTemplateOutlet, RouterLink, PageTitle, SymbolCard, DonationsPending, DonationsTable],
  templateUrl: './donor-overview.html',
  styleUrl: './donor-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorOverview {
  protected readonly donations = inject(DonorDonations);
  protected readonly donor = inject(AuthStore).donor;

  protected readonly recent = computed(() =>
    this.donations.items().slice(0, RECENT_DONATIONS_SHOWN),
  );

  private readonly accounts = signal<readonly BankAccountItem[]>([]);
  protected readonly accountsWithQuestion = computed(() =>
    this.accounts().filter((account) => account.symbolOffer !== null),
  );

  protected readonly receiptYear = computed(() => {
    const summary = this.donations.summary();
    if (summary === null) {
      return null;
    }
    const year = summary.yearlyReceiptsAvailableThrough;
    const gave = summary.byYear.some((entry) => entry.year === year && entry.count > 0);
    return gave && year >= summary.receiptsAvailableFrom ? year : null;
  });

  constructor() {
    inject(BankAccountsApi)
      .list()
      .subscribe({
        next: (list) => this.accounts.set(list.items),
        error: () => this.accounts.set([]),
      });
  }

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }

  protected formatBankTime(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected formatDate(isoDate: string): string {
    return formatDonationDate(isoDate);
  }
}
