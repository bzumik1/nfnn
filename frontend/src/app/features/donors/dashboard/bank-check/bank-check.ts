/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { pluralCategory } from '../../../../core/i18n/plural-category';
import { formatBankTime } from '../../../donations/donation-date';
import { BankCheckOutcome, DonorDonations } from '../donor-donations';

@Component({
  selector: 'app-bank-check',
  templateUrl: './bank-check.html',
  styleUrl: './bank-check.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankCheck {
  protected readonly donations = inject(DonorDonations);

  protected readonly outcome = computed(() => outcomeText(this.donations.bankCheckOutcome()));
  protected readonly failed = computed(() => this.donations.bankCheckOutcome()?.kind === 'failed');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.donations.clearBankCheckOutcome());
  }

  protected formatBankTime(isoInstant: string): string {
    return formatBankTime(isoInstant);
  }
}

function outcomeText(outcome: BankCheckOutcome | null): string {
  switch (outcome?.kind) {
    case 'found':
      return foundText(outcome.count);
    case 'none':
      return $localize`:@@donor.dashboard.bank.outcome.none:Žádný nový dar zatím nepřišel.`;
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
