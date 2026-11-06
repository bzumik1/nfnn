/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

let nextId = 0;

export const DRAFT_RESUMED_TEXT = $localize`:@@ui.draftOffer.resumed:Pokračujete v rozepsaných úpravách. Zůstanou jen na tomto zařízení, dokud je neuložíte.`;
export const DRAFT_DISCARDED_TEXT = $localize`:@@ui.draftOffer.discarded:Rozepsané úpravy jsme z tohoto zařízení zahodili.`;

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
  readonly secrets = input(false);
  readonly headingLevel = input<2 | 3>(2);
  readonly resumed = output<void>();
  readonly discarded = output<void>();

  protected readonly titleId = `draft-offer-title-${nextId++}`;

  constructor() {
    const document = inject(DOCUMENT);
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      const active = document.activeElement;
      if (active === null || active === document.body || insideInert(active)) {
        host.querySelector<HTMLElement>('.draft-offer__title')?.focus();
      }
    });
  }
}

function insideInert(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (node instanceof HTMLElement && node.inert) {
      return true;
    }
  }
  return false;
}
