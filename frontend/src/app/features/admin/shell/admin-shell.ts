/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SideNav, SideNavGroup } from '../../../shared/ui/side-nav/side-nav';
import { DashboardTopBar } from '../../donors/dashboard/top-bar/top-bar';

export const ADMIN_SECTIONS: readonly SideNavGroup[] = [
  {
    id: 'admin-nav-home',
    label: null,
    items: [{ path: '/sprava', label: $localize`:@@admin.nav.home:Přehled`, exact: true }],
  },
  {
    id: 'admin-nav-money',
    label: $localize`:@@admin.nav.group.money:Peníze`,
    items: [
      { path: '/sprava/platby', label: $localize`:@@admin.nav.payments:Platby z banky` },
      {
        path: '/sprava/starsi-symboly',
        label: $localize`:@@admin.nav.symbolClaims:Starší symboly`,
      },
      { path: '/sprava/prehledy', label: $localize`:@@admin.nav.report:Měsíční přehled` },
    ],
  },
  {
    id: 'admin-nav-people',
    label: $localize`:@@admin.nav.group.people:Lidé`,
    items: [
      { path: '/sprava/darci', label: $localize`:@@admin.nav.donors:Dárci` },
      { path: '/sprava/spravci', label: $localize`:@@admin.nav.administrators:Správci` },
    ],
  },
  {
    id: 'admin-nav-web',
    label: $localize`:@@admin.nav.group.web:Web`,
    items: [
      { path: '/sprava/aktuality', label: $localize`:@@admin.nav.news:Aktuality` },
      { path: '/sprava/projekty', label: $localize`:@@admin.nav.projects:Projekty` },
    ],
  },
  {
    id: 'admin-nav-operations',
    label: $localize`:@@admin.nav.group.operations:Provoz`,
    items: [
      { path: '/sprava/zalohy', label: $localize`:@@admin.nav.backups:Zálohy` },
      { path: '/sprava/logy', label: $localize`:@@admin.nav.logs:Logy a diagnostika` },
      { path: '/sprava/nastaveni', label: $localize`:@@admin.nav.settings:Nastavení` },
      { path: '/sprava/historie', label: $localize`:@@admin.nav.actions:Historie správy` },
    ],
  },
];

@Component({
  selector: 'app-admin-shell',
  imports: [DashboardTopBar, RouterOutlet, SideNav],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShell {
  protected readonly groups = ADMIN_SECTIONS;
  protected readonly navLabel = $localize`:@@admin.nav.label:Správa`;
  protected readonly menuLabel = $localize`:@@admin.nav.toggle:Menu správy`;
}
