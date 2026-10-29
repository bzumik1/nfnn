import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { AuthStore } from '../../../../core/auth/auth-store';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { DonationItem } from '../../../donations/donations-api';
import { BankCheck } from '../bank-check/bank-check';
import { MissingGift } from '../missing-gift/missing-gift';
import { DonationsPending } from '../donations-pending/donations-pending';
import { DonationsTable } from '../donations-table/donations-table';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';
import { StandingOrder } from '../standing-order/standing-order';
import { YearReceipt, yearReceipt } from '../yearly-receipt';

interface GiftYear {
  readonly year: number;
  readonly items: readonly DonationItem[];
  readonly count: number;
  readonly totalAmountMinor: number;
  readonly receipt: YearReceipt;
}

@Component({
  selector: 'app-donor-gifts',
  imports: [PageTitle, BankCheck, DonationsPending, DonationsTable, MissingGift, StandingOrder],
  templateUrl: './donor-gifts.html',
  styleUrl: './donor-gifts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorGifts {
  protected readonly donations = inject(DonorDonations);
  protected readonly donor = inject(AuthStore).donor;

  private readonly receiptAlert = viewChild<ElementRef<HTMLElement>>('receiptAlert');

  protected readonly receivedWithoutReceipt = computed(() =>
    this.donations.items().some((item) => item.status === 'RECEIVED' && !item.receiptAvailable),
  );

  protected readonly years = computed<readonly GiftYear[]>(() => {
    const summary = this.donations.summary();
    if (summary === null) {
      return [];
    }
    const byYear = new Map<number, DonationItem[]>();
    for (const item of this.donations.items()) {
      const year = Number(item.receivedAt.slice(0, 4));
      byYear.set(year, [...(byYear.get(year) ?? []), item]);
    }
    return [...byYear.entries()].map(([year, items]) => {
      const total = summary.byYear.find((entry) => entry.year === year);
      return {
        year,
        items,
        count: total?.count ?? 0,
        totalAmountMinor: total?.totalAmountMinor ?? 0,
        receipt: yearReceipt(year, summary),
      };
    });
  });

  constructor() {
    effect(() => this.receiptAlert()?.nativeElement.scrollIntoView?.({ block: 'center' }));
  }

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }

  protected yearHeadingId(year: number): string {
    return `gifts-year-${year}`;
  }
}
