/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { pluralCategory } from '../../../core/i18n/plural-category';
import { SideNav, SideNavBadge, SideNavGroup } from '../../../shared/ui/side-nav/side-nav';
import { DonorDonations } from './donor-donations';
import { DashboardTopBar } from './top-bar/top-bar';

const BANK_ACCOUNTS_PATH = '/darce/ucty';

export const DONOR_SECTIONS: readonly SideNavGroup[] = [
  {
    id: 'donor-nav-sections',
    label: null,
    items: [
      { path: '/darce/prehled', label: $localize`:@@donor.nav.overview:Přehled` },
      { path: '/darce/dary', label: $localize`:@@donor.nav.gifts:Moje dary` },
      { path: '/darce/potvrzeni', label: $localize`:@@donor.nav.receipts:Potvrzení o daru` },
      { path: BANK_ACCOUNTS_PATH, label: $localize`:@@donor.nav.bankAccounts:Bankovní účty` },
      { path: '/darce/udaje', label: $localize`:@@donor.nav.details:Údaje a zabezpečení` },
    ],
  },
];

@Component({
  selector: 'app-donor-area',
  imports: [RouterLink, RouterOutlet, DashboardTopBar, SideNav],
  providers: [DonorDonations],
  templateUrl: './donor-area.html',
  styleUrl: './donor-area.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorArea {
  private readonly donations = inject(DonorDonations);

  protected readonly groups = computed(() =>
    withBankAccountsBadge(questionsBadge(this.donations.accountsWithQuestion().length)),
  );
  protected readonly navLabel = $localize`:@@donor.nav.label:Můj účet`;
  protected readonly menuLabel = $localize`:@@donor.nav.toggle:Menu účtu`;
}

function withBankAccountsBadge(badge: SideNavBadge): readonly SideNavGroup[] {
  return DONOR_SECTIONS.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.path === BANK_ACCOUNTS_PATH ? { ...item, badge } : item,
    ),
  }));
}

function questionsBadge(count: number): SideNavBadge {
  return { count, description: questionsDescription(count) };
}

function questionsDescription(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@donor.nav.questions.one:${count}:count: otázka čeká na odpověď`;
    case 'few':
      return $localize`:@@donor.nav.questions.few:${count}:count: otázky čekají na odpověď`;
    default:
      return $localize`:@@donor.nav.questions.other:${count}:count: otázek čeká na odpověď`;
  }
}
