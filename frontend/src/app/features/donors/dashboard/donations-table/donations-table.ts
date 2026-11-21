import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { BREAKPOINTS } from '../../../../core/layout/breakpoints';
import { CompactLayout } from '../../../../core/layout/compact-layout';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { formatDonationDate } from '../../../donations/donation-date';
import { DonationItem, DonationStatus } from '../../../donations/donations-api';
import { DonorDonations } from '../donor-donations';
import { PdfButtonFace } from '../../../../shared/ui/pdf-button-face/pdf-button-face';
import { PdfProgress } from '../../../../shared/ui/pdf-progress/pdf-progress';
import { DiagnosticsDownload } from '../../../../shared/ui/diagnostics-download/diagnostics-download';

const STATUS_LABELS: Record<DonationStatus, string> = {
  RECEIVED: $localize`:@@donor.dashboard.payments.status.received:Přijato`,
  REFUNDED: $localize`:@@donor.dashboard.payments.status.refunded:Vráceno`,
};

const SENDER_ACCOUNT_DIGITS_SHOWN = 4;
const CHARACTERS_OF_A_DEFAULT_AMOUNT = 7;
const DEFAULT_ROOT_FONT_PX = 16;
const LEDGER_REM = BREAKPOINTS.ledger / DEFAULT_ROOT_FONT_PX;

export function donationStatusLabel(status: DonationStatus): string {
  return STATUS_LABELS[status];
}

@Component({
  selector: 'app-donations-table',
  imports: [DiagnosticsDownload, PdfButtonFace, PdfProgress, NgTemplateOutlet],
  templateUrl: './donations-table.html',
  styleUrl: './donations-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.donations-table--narrow]': 'narrow()' },
})
export class DonationsTable {
  protected readonly donations = inject(DonorDonations);
  private readonly layout = inject(CompactLayout);
  protected readonly rows = this.layout.listsAsRows;
  private readonly hostWidth = signal<number | null>(null);
  protected readonly narrow = computed(() => {
    const width = this.hostWidth();
    return !this.rows() && width !== null && width / this.layout.rootFontPx() <= LEDGER_REM;
  });

  readonly items = input.required<readonly DonationItem[]>();
  readonly withReceipts = input(true);
  readonly errorsAtRows = input(false);
  readonly labelledBy = input<string | null>(null);

  constructor() {
    const document = inject(DOCUMENT);
    const view = document.defaultView;
    const Observer = view?.ResizeObserver;
    if (!view || typeof Observer !== 'function') {
      return;
    }
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const follow = (inlineSize: number): void => {
      if (inlineSize > 0) {
        this.hostWidth.set(inlineSize);
      }
    };
    const observer = new Observer((entries) => {
      const entry = entries.at(-1);
      follow(entry?.contentBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? 0);
    });
    observer.observe(host);
    afterRenderEffect({
      read: () => {
        if (!this.rows()) {
          untracked(() => follow(parseFloat(view.getComputedStyle(host).width)));
        }
      },
    });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  protected crowns(amountMinor: number): string {
    return formatMinorUnits(amountMinor);
  }

  protected formatDate(isoDate: string): string {
    return formatDonationDate(isoDate);
  }

  protected longAmount(item: DonationItem): boolean {
    return this.crowns(item.amountMinor).length > CHARACTERS_OF_A_DEFAULT_AMOUNT;
  }

  protected senderAccountEnd(senderAccount: string): string {
    const [number, bankCode] = senderAccount.split('/');
    const lastDigits = number.replace(/\D/g, '').slice(-SENDER_ACCOUNT_DIGITS_SHOWN);
    return bankCode === undefined ? `…${lastDigits}` : `…${lastDigits}/${bankCode}`;
  }

  protected hasPairingTag(item: DonationItem): boolean {
    return (
      Boolean(item.senderAccount) &&
      (item.pairedBy === 'SENDER_ACCOUNT' ||
        (item.pairedBy === 'CONFIRMED_SYMBOL' && Boolean(item.confirmedSymbol)))
    );
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
