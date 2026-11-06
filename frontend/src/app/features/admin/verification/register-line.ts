import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatBankTime, formatDonationDate, pragueDay } from '../../donations/donation-date';
import type { SignedReceipt } from '../../donations/verification/receipt-proof';
import type { SignedStatus } from '../../donations/verification/receipt-verifier';
import { AdministrationCopy } from '../device-copy/administration-copy';
import { type AdminReceiptRow, registerView } from './receipt-register';

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
  readonly status = input.required<SignedStatus>();

  protected readonly view = computed(() =>
    registerView(this.receipt(), this.rows(), this.status()),
  );
  protected readonly day = computed(() => {
    const on = this.view().on;
    return on === null ? null : formatDonationDate(pragueDay(on));
  });
  protected readonly storedOn = computed(() => {
    const storedAt = this.copy.storedAt();
    return storedAt === null ? null : formatDonationDate(pragueDay(storedAt));
  });
  protected readonly storedTime = computed(() => {
    const storedAt = this.copy.storedAt();
    return storedAt === null ? null : formatBankTime(storedAt).slice(-5);
  });
}
