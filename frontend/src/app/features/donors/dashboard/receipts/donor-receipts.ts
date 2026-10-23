import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCrowns } from '../../../donations/donation-amount';
import { DonationsPending } from '../donations-pending/donations-pending';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';

type YearReceipt = 'available' | 'after-year-end' | 'not-issued';

interface YearRow {
  readonly year: number;
  readonly count: number;
  readonly totalAmountMinor: number;
  readonly receipt: YearReceipt;
}

const MINOR_UNITS_PER_CROWN = 100;

@Component({
  selector: 'app-donor-receipts',
  imports: [RouterLink, PageTitle, DonationsPending],
  templateUrl: './donor-receipts.html',
  styleUrl: './donor-receipts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorReceipts {
  protected readonly donations = inject(DonorDonations);

  protected readonly rows = computed<readonly YearRow[]>(() => {
    const summary = this.donations.summary();
    if (summary === null) {
      return [];
    }
    return summary.byYear.map((entry) => ({
      ...entry,
      receipt:
        entry.year < summary.receiptsAvailableFrom
          ? 'not-issued'
          : entry.year > summary.yearlyReceiptsAvailableThrough
            ? 'after-year-end'
            : 'available',
    }));
  });

  protected readonly someNotIssued = computed(() =>
    this.rows().some((row) => row.receipt === 'not-issued'),
  );

  protected crowns(amountMinor: number): string {
    return formatCrowns(amountMinor / MINOR_UNITS_PER_CROWN);
  }
}
