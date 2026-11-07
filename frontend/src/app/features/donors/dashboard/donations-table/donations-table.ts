import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CompactLayout } from '../../../../core/layout/compact-layout';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { formatDonationDate } from '../../../donations/donation-date';
import { DonationItem, DonationStatus } from '../../../donations/donations-api';
import { DonorDonations } from '../donor-donations';
import { DownloadProgress } from '../../../../shared/ui/download-progress/download-progress';
import { DiagnosticsDownload } from '../../../../shared/ui/diagnostics-download/diagnostics-download';

const STATUS_LABELS: Record<DonationStatus, string> = {
  RECEIVED: $localize`:@@donor.dashboard.payments.status.received:Přijato`,
  REFUNDED: $localize`:@@donor.dashboard.payments.status.refunded:Vráceno`,
};

const SENDER_ACCOUNT_DIGITS_SHOWN = 4;

export function donationStatusLabel(status: DonationStatus): string {
  return STATUS_LABELS[status];
}

@Component({
  selector: 'app-donations-table',
  imports: [DiagnosticsDownload, DownloadProgress, NgTemplateOutlet],
  templateUrl: './donations-table.html',
  styleUrl: './donations-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationsTable {
  protected readonly donations = inject(DonorDonations);
  protected readonly rows = inject(CompactLayout).listsAsRows;

  readonly items = input.required<readonly DonationItem[]>();
  readonly withReceipts = input(true);
  readonly errorsAtRows = input(false);
  readonly labelledBy = input<string | null>(null);

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

  protected missingReceipt(
    item: DonationItem,
  ): 'on-yearly-receipt' | 'refunded' | 'verification' | 'before-first-year' | null {
    if (this.donations.onYearlyReceipt(item)) {
      return 'on-yearly-receipt';
    }
    if (item.receiptAvailable) {
      return null;
    }
    if (item.status === 'REFUNDED') {
      return 'refunded';
    }
    if (item.accountVerification) {
      return 'verification';
    }
    const firstYear = this.donations.receiptsFrom();
    return firstYear !== null && Number(item.receivedAt.slice(0, 4)) < firstYear
      ? 'before-first-year'
      : null;
  }

  protected yearOf(item: DonationItem): string {
    return item.receivedAt.slice(0, 4);
  }

  protected statusLabel(status: DonationStatus): string {
    return donationStatusLabel(status);
  }
}
