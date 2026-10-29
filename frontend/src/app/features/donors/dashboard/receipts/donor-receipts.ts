import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { MissingGift } from '../missing-gift/missing-gift';
import { DonationsPending } from '../donations-pending/donations-pending';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';
import { YearReceipt, yearReceipt } from '../yearly-receipt';

interface YearRow {
  readonly year: number;
  readonly count: number;
  readonly totalAmountMinor: number;
  readonly receipt: YearReceipt;
}

@Component({
  selector: 'app-donor-receipts',
  imports: [RouterLink, PageTitle, DonationsPending, MissingGift],
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
      receipt: yearReceipt(entry.year, summary),
    }));
  });

  protected readonly someNotIssued = computed(() =>
    this.rows().some((row) => row.receipt === 'not-issued'),
  );

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }
}
