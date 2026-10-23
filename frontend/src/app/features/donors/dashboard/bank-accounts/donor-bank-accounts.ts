import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { skip } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { BankAccountsCard } from '../bank-accounts-card/bank-accounts-card';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';

@Component({
  selector: 'app-donor-bank-accounts',
  imports: [PageTitle, BankAccountsCard],
  templateUrl: './donor-bank-accounts.html',
  styleUrl: './donor-bank-accounts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorBankAccounts {
  protected readonly donations = inject(DonorDonations);
  protected readonly donor = inject(AuthStore).donor;

  private readonly card = viewChild.required(BankAccountsCard);

  constructor() {
    toObservable(this.donations.bankDataArrived)
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe(() => this.card().reload());
  }
}
