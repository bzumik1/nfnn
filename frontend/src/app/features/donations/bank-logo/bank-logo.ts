import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { BankNames } from '../bank-names';
import { BankMark, BankMarkSize } from './bank-mark';

@Component({
  selector: 'app-bank-logo',
  imports: [BankMark],
  template: '<app-bank-mark [src]="src()" [name]="name()" [size]="size()" />',
  styleUrl: './bank-logo.scss',
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankLogo {
  private readonly bankNames = inject(BankNames);
  readonly account = input.required<string>();
  readonly size = input.required<BankMarkSize>();

  protected readonly src = computed(() => this.bankNames.logoOf(this.account()));
  protected readonly name = computed(() => this.bankNames.nameOf(this.account()));

  constructor() {
    effect(() => this.bankNames.require(this.account()));
  }
}
