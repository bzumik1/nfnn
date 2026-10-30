/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { formatIban } from '../../donations/iban-format';
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
  protected readonly seat = $localize`:@@home.contact.accounting.seatValue:Jiráskova 436, 473 01 Nový Bor`;
  private readonly paymentDetails = inject(PaymentDetailsStore);
  protected readonly account = computed(() => {
    const state = this.paymentDetails.state();
    return state.kind === 'ready' ? state.details.account : null;
  });
  protected readonly iban = computed(() => {
    const account = this.account();
    return account ? formatIban(account.iban) : '';
  });
}
