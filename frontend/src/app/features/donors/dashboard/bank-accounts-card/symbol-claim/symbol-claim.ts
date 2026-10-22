import { Component, computed, input, output, signal } from '@angular/core';
import { SymbolOffer } from '../../../../donations/bank-accounts-api';
import { formatMonthRange } from '../../../../donations/donation-month';

export type SymbolClaimAnswer = 'confirm' | 'decline';

@Component({
  selector: 'app-symbol-claim',
  templateUrl: './symbol-claim.html',
  styleUrl: './symbol-claim.scss',
})
export class SymbolClaim {
  readonly accountId = input.required<string>();
  readonly offer = input.required<SymbolOffer>();
  readonly donorName = input('');
  readonly busy = input(false);
  readonly answer = output<SymbolClaimAnswer>();

  protected readonly pressed = signal<SymbolClaimAnswer | null>(null);
  protected readonly months = computed(() => formatMonthRange(this.offer().firstMonth, this.offer().lastMonth));
  protected readonly questionId = computed(() => `${this.idPrefix()}-question`);
  protected readonly noteId = computed(() => `${this.idPrefix()}-note`);
  private readonly idPrefix = computed(() => `symbol-claim-${this.accountId().replace(/[^A-Za-z0-9_-]/g, '_')}`);

  protected press(answer: SymbolClaimAnswer): void {
    if (this.busy()) {
      return;
    }
    this.pressed.set(answer);
    this.answer.emit(answer);
  }
}
