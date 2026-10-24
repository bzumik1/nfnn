import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { formatDonationDate } from '../../../donations/donation-date';
import { DonationsPending } from '../donations-pending/donations-pending';
import { DonationsTable } from '../donations-table/donations-table';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';
import { SymbolCard } from '../symbol-card/symbol-card';

const RECENT_DONATIONS_SHOWN = 5;

@Component({
  selector: 'app-donor-overview',
  imports: [RouterLink, PageTitle, SymbolCard, DonationsPending, DonationsTable],
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

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }

  protected formatDate(isoDate: string): string {
    return formatDonationDate(isoDate);
  }
}
