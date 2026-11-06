import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatBankTime, formatDonationDate, pragueDay } from '../../donations/donation-date';
import type { SignedReceipt } from '../../donations/verification/receipt-proof';
import { AdministrationCopy } from '../device-copy/administration-copy';
import { type AdminReceiptRow, registerEntry } from './receipt-register';

@Component({
  selector: 'app-register-line',
  imports: [RouterLink],
  templateUrl: './register-line.html',
  styleUrl: './register-line.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterLine {
  private readonly copy = inject(AdministrationCopy);
  private readonly rows = this.copy.rows<AdminReceiptRow>('donations', 'receipts');

  readonly receipt = input.required<SignedReceipt>();

  protected readonly entry = computed(() => registerEntry(this.receipt(), this.rows()));
  protected readonly donorId = computed(() => {
    const entry = this.entry();
    return 'donorId' in entry ? entry.donorId : null;
  });
  protected readonly day = computed(() => {
    const entry = this.entry();
    return 'on' in entry && entry.on !== null ? formatDonationDate(pragueDay(entry.on)) : null;
  });
  protected readonly newer = computed(() => {
    const entry = this.entry();
    return entry.state === 'replaced' ? entry.by : null;
  });
  protected readonly storedAt = computed(() => {
    const storedAt = this.copy.storedAt();
    return storedAt === null ? null : formatBankTime(storedAt);
  });
}
