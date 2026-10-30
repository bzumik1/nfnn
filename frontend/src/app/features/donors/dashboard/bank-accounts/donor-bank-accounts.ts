import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { skip } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { BankAccountsCard } from '../bank-accounts-card/bank-accounts-card';
import { DonorDonations } from '../donor-donations';
import { ADD_ACCOUNT_QUERY } from '../missing-gift/missing-gift';
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

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly card = viewChild.required(BankAccountsCard);

  constructor() {
    toObservable(this.donations.bankDataArrived)
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe(() => this.card().reload());
    afterNextRender({ read: () => this.openAddWhenAsked() });
  }

  private openAddWhenAsked(): void {
    const [name, value] = Object.entries(ADD_ACCOUNT_QUERY)[0];
    if (this.route.snapshot.queryParamMap.get(name) !== value) {
      return;
    }
    this.card().openAddDialog();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [name]: null },
      replaceUrl: true,
    });
  }
}
