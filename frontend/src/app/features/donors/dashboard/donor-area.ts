/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SideNav, SideNavGroup } from '../../../shared/ui/side-nav/side-nav';
import { DonorDonations } from './donor-donations';
import { DashboardTopBar } from './top-bar/top-bar';

export const DONOR_SECTIONS: readonly SideNavGroup[] = [
  {
    id: 'donor-nav-sections',
    label: null,
    items: [
      { path: '/darce/prehled', label: $localize`:@@donor.nav.overview:Přehled` },
      { path: '/darce/dary', label: $localize`:@@donor.nav.gifts:Moje dary` },
      { path: '/darce/potvrzeni', label: $localize`:@@donor.nav.receipts:Potvrzení o daru` },
      { path: '/darce/ucty', label: $localize`:@@donor.nav.bankAccounts:Bankovní účty` },
      { path: '/darce/udaje', label: $localize`:@@donor.nav.details:Údaje a zabezpečení` },
    ],
  },
];

@Component({
  selector: 'app-donor-area',
  imports: [RouterOutlet, DashboardTopBar, SideNav],
  providers: [DonorDonations],
  templateUrl: './donor-area.html',
  styleUrl: './donor-area.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorArea {
  protected readonly groups = DONOR_SECTIONS;
  protected readonly navLabel = $localize`:@@donor.nav.label:Můj účet`;
  protected readonly menuLabel = $localize`:@@donor.nav.toggle:Menu účtu`;
}
