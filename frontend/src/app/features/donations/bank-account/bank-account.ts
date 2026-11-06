import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { bankNameOf } from '../czech-banks';

@Component({
  selector: 'app-bank-account',
  templateUrl: './bank-account.html',
  styleUrl: './bank-account.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankAccount {
  readonly account = input.required<string>();
  protected readonly bank = computed(() => bankNameOf(this.account()));
}
