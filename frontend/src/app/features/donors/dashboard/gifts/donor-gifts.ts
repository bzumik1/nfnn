import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatBankTime } from '../../../donations/donation-date';
import { DonationsPending } from '../donations-pending/donations-pending';
import { DonationsTable } from '../donations-table/donations-table';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';

@Component({
  selector: 'app-donor-gifts',
  imports: [RouterLink, PageTitle, DonationsPending, DonationsTable],
  templateUrl: './donor-gifts.html',
  styleUrl: './donor-gifts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorGifts {
  protected readonly donations = inject(DonorDonations);

  private readonly receiptAlert = viewChild<ElementRef<HTMLElement>>('receiptAlert');

  protected readonly receivedWithoutReceipt = computed(() =>
    this.donations.items().some((item) => item.status === 'RECEIVED' && !item.receiptAvailable),
  );

  constructor() {
    effect(() => this.receiptAlert()?.nativeElement.scrollIntoView?.({ block: 'center' }));
  }

  protected formatBankTime(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }
}
