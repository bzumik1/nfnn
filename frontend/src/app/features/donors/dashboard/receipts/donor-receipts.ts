import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { DonationItem } from '../../../donations/donations-api';
import { DonationsTable } from '../donations-table/donations-table';
import { MissingGift } from '../missing-gift/missing-gift';
import { DonationsPending } from '../donations-pending/donations-pending';
import { DonorDonations } from '../donor-donations';
import { DownloadProgress } from '../../../../shared/ui/download-progress/download-progress';
import { GiftCount, receivedVerifications } from '../gift-count/gift-count';
import { PageTitle } from '../page-title/page-title';
import { YearReceipt, yearReceipt } from '../yearly-receipt';

interface YearRow {
  readonly year: number;
  readonly gifts: number;
  readonly verifications: number;
  readonly totalAmountMinor: number;
  readonly receipt: YearReceipt;
}

@Component({
  selector: 'app-donor-receipts',
  imports: [
    DownloadProgress,
    RouterLink,
    PageTitle,
    DonationsPending,
    DonationsTable,
    GiftCount,
    MissingGift,
  ],
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
    const items = this.donations.items();
    return summary.byYear.map((entry) => {
      const verifications = receivedVerifications(items, entry.year);
      return {
        year: entry.year,
        gifts: Math.max(entry.count - verifications, 0),
        verifications,
        totalAmountMinor: entry.totalAmountMinor,
        receipt: yearReceipt(entry.year, summary),
      };
    });
  });

  protected readonly runningYearGifts = computed<readonly DonationItem[]>(() => {
    const summary = this.donations.summary();
    if (summary === null) {
      return [];
    }
    return this.donations
      .items()
      .filter(
        (item) =>
          item.receiptAvailable &&
          yearReceipt(Number(item.receivedAt.slice(0, 4)), summary) === 'after-year-end',
      );
  });

  protected readonly someNotIssued = computed(() =>
    this.rows().some((row) => row.receipt === 'not-issued'),
  );

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }
}
