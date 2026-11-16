/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { ibanGroups } from '../../donations/iban-format';
import { PaymentDetailsStore } from '../../donations/payment-details-store';

@Component({
  selector: 'app-accounting-details',
  imports: [RouterLink, CopyButton],
  templateUrl: './accounting-details.html',
  styleUrl: './accounting-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingDetails {
  protected readonly companyId = '27278794';
  protected readonly seat = $localize`:@@home.contact.accounting.seatValue:Jiráskova 436, 473\u00a001 Nový Bor`;
  protected readonly seatToCopy = this.seat.replaceAll('\u00a0', ' ');
  private readonly paymentDetails = inject(PaymentDetailsStore);
  protected readonly account = computed(() => {
    const state = this.paymentDetails.state();
    return state.kind === 'ready' ? state.details.account : null;
  });
  protected readonly ibanGroups = computed(() => {
    const account = this.account();
    return account ? ibanGroups(account.iban) : [];
  });

  constructor() {
    this.paymentDetails.load();
  }
}
