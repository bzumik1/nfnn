/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

let nextId = 0;

export const DRAFT_RESUMED_TEXT = $localize`:@@ui.draftOffer.resumed:Pokračujete v rozepsaném textu. Uloží se, až ho uložíte.`;
export const DRAFT_DISCARDED_TEXT = $localize`:@@ui.draftOffer.discarded:Rozepsaný text jsme z tohoto zařízení zahodili.`;

@Component({
  selector: 'app-draft-offer',
  templateUrl: './draft-offer.html',
  styleUrl: './draft-offer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftOffer {
  readonly savedAt = input.required<string>();
  readonly stale = input(false);
  readonly photo = input(false);
  readonly headingLevel = input(2);
  readonly resumed = output<void>();
  readonly discarded = output<void>();

  protected readonly titleId = `draft-offer-title-${nextId++}`;
}
