import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { formatDonationDate } from '../../../donations/donation-date';
import { DonationItem, DonationStatus } from '../../../donations/donations-api';
import { DonorDonations } from '../donor-donations';

const STATUS_LABELS: Record<DonationStatus, string> = {
  RECEIVED: $localize`:@@donor.dashboard.payments.status.received:Přijato`,
  REFUNDED: $localize`:@@donor.dashboard.payments.status.refunded:Vráceno`,
};

const SENDER_ACCOUNT_DIGITS_SHOWN = 4;

@Component({
  selector: 'app-donations-table',
  templateUrl: './donations-table.html',
  styleUrl: './donations-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationsTable {
  protected readonly donations = inject(DonorDonations);

  readonly items = input.required<readonly DonationItem[]>();
  readonly withReceipts = input(true);

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }

  protected formatDate(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected senderAccountEnd(senderAccount: string): string {
    const [number, bankCode] = senderAccount.split('/');
    const lastDigits = number.replace(/\D/g, '').slice(-SENDER_ACCOUNT_DIGITS_SHOWN);
    return bankCode === undefined ? `…${lastDigits}` : `…${lastDigits}/${bankCode}`;
  }

  protected statusLabel(status: DonationStatus): string {
    return STATUS_LABELS[status];
  }
}
