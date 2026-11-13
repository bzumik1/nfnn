/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { pluralCategory } from '../../../../core/i18n/plural-category';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formatBankTime } from '../../../donations/donation-date';
import { BankCheckOutcome, DonorDonations } from '../donor-donations';

@Component({
  selector: 'app-bank-check',
  imports: [NeedsConnection],
  templateUrl: './bank-check.html',
  styleUrl: './bank-check.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankCheck {
  protected readonly donations = inject(DonorDonations);
  private readonly injector = inject(Injector);
  private readonly checkButton = viewChild.required<ElementRef<HTMLButtonElement>>('checkButton');

  protected readonly outcome = computed(() => outcomeText(this.donations.bankCheckOutcome()));
  protected readonly failed = computed(() => this.donations.bankCheckOutcome()?.kind === 'failed');
  protected readonly incoming = computed(() => incomingText(this.donations.incomingCount()));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.donations.clearBankCheckOutcome());
  }

  protected formatBankTime(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }

  protected showIncoming(): void {
    this.donations.showIncoming();
    afterNextRender(() => this.checkButton().nativeElement.focus(), { injector: this.injector });
  }
}

function incomingText(count: number): string {
  if (count === 0) {
    return '';
  }
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@donor.dashboard.bank.incoming.one:Zobrazit ${count}:count: nový dar`;
    case 'few':
      return $localize`:@@donor.dashboard.bank.incoming.few:Zobrazit ${count}:count: nové dary`;
    default:
      return $localize`:@@donor.dashboard.bank.incoming.other:Zobrazit ${count}:count: nových darů`;
  }
}

function outcomeText(outcome: BankCheckOutcome | null): string {
  switch (outcome?.kind) {
    case 'found':
      return foundText(outcome.count);
    case 'none':
      return $localize`:@@donor.dashboard.bank.outcome.none:Žádný nový dar zatím nepřišel. Banky se ptáme nejvýš jednou za 30 sekund, zkuste to proto za chvíli znovu.`;
    case 'unfinished':
      return $localize`:@@donor.dashboard.bank.outcome.unfinished:Banka zatím neodpověděla. Zkuste to prosím za chvíli znovu.`;
    default:
      return '';
  }
}

function foundText(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@donor.dashboard.bank.outcome.found.one:Přibyl ${count}:count: nový dar.`;
    case 'few':
      return $localize`:@@donor.dashboard.bank.outcome.found.few:Přibyly ${count}:count: nové dary.`;
    default:
      return $localize`:@@donor.dashboard.bank.outcome.found.other:Přibylo ${count}:count: nových darů.`;
  }
}
