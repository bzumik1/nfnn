import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { bankMonogram } from '../bank-monogram';

export type BankMarkSize = 24 | 40;

const SMALL: BankMarkSize = 24;
const SHORT_MONOGRAM = 2;

@Component({
  selector: 'app-bank-mark',
  templateUrl: './bank-mark.html',
  styleUrl: './bank-mark.scss',
  host: { 'aria-hidden': 'true', '[class.bank-mark--small]': 'size() === small' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankMark {
  readonly src = input<string | null>(null);
  readonly name = input<string | null>(null);
  readonly size = input.required<BankMarkSize>();

  protected readonly small = SMALL;
  protected readonly failed = linkedSignal({ source: this.src, computation: () => false });
  protected readonly image = computed(() => (this.failed() ? null : this.src()));
  protected readonly monogram = computed(() => {
    const name = this.name();
    const monogram = name === null ? '' : bankMonogram(name);
    return monogram === '' ? null : monogram;
  });
  protected readonly longMonogram = computed(() => (this.monogram()?.length ?? 0) > SHORT_MONOGRAM);
}
