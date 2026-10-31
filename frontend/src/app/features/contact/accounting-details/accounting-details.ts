/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { formatIban } from '../../donations/iban-format';
import { PaymentQrApi } from '../../donations/payment-qr-api';

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
  protected readonly account = inject(PaymentQrApi).foundationAccount;
  protected readonly iban = computed(() => {
    const account = this.account();
    return account ? formatIban(account.iban) : '';
  });
}
