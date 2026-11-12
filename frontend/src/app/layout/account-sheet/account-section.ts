import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  InjectionToken,
  input,
  signal,
  Type,
  untracked,
} from '@angular/core';

import { GIFT_FEED } from '../../features/donations/gift-arrival/gift-feed';
import { DonorDonations } from '../../features/donors/dashboard/donor-donations';
import { PAGE_IN_SHEET } from '../../features/donors/dashboard/page-title/page-title';
import { DONOR_SECTION_PAGES } from '../../features/donors/donors.routes';

export type AccountSectionPages = Readonly<Record<string, () => Promise<Type<unknown>>>>;

export const ACCOUNT_SECTION_PAGES = new InjectionToken<AccountSectionPages>(
  'ACCOUNT_SECTION_PAGES',
  { factory: () => DONOR_SECTION_PAGES },
);

@Component({
  selector: 'app-account-section',
  imports: [NgComponentOutlet],
  providers: [
    DonorDonations,
    { provide: GIFT_FEED, useExisting: DonorDonations },
    { provide: PAGE_IN_SHEET, useValue: true },
  ],
  template: `@if (page(); as component) {
    <ng-container *ngComponentOutlet="component" />
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSection {
  readonly path = input.required<string>();
  private readonly pages = inject(ACCOUNT_SECTION_PAGES);
  protected readonly page = signal<Type<unknown> | null>(null);

  constructor() {
    effect(() => {
      const path = this.path();
      untracked(() => {
        this.page.set(null);
        void this.pages[path]?.().then((component) => {
          if (this.path() === path) {
            this.page.set(component);
          }
        });
      });
    });
  }
}
