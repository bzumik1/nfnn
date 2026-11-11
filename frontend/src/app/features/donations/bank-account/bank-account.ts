import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { BankLogo } from '../bank-logo/bank-logo';
import { BankNames } from '../bank-names';
import { bankCodeOf } from '../czech-account';

@Component({
  selector: 'app-bank-account',
  imports: [BankLogo],
  templateUrl: './bank-account.html',
  styleUrl: './bank-account.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankAccount {
  private readonly bankNames = inject(BankNames);
  readonly account = input.required<string>();
  protected readonly czech = computed(() => bankCodeOf(this.account()) !== null);
  protected readonly bank = computed(() => this.bankNames.nameOf(this.account()));

  constructor() {
    effect(() => this.bankNames.require(this.account()));
  }
}
