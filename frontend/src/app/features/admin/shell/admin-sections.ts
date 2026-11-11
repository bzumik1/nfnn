/// <reference types="@angular/localize" />

import { SideNavGroup } from '../../../shared/ui/side-nav/side-nav';

export const ADMIN_HOME_PATH = '/sprava';
export const ADMIN_MORE_PATH = '/sprava/vice';
export const ADMIN_PAYMENTS_PATH = '/sprava/platby';
export const ADMIN_LOGS_PATH = '/sprava/logy';
export const ADMIN_BACKUPS_PATH = '/sprava/zalohy';

export const ADMIN_OVERVIEW: SideNavGroup = {
  id: 'admin-nav-home',
  label: null,
  items: [{ path: ADMIN_HOME_PATH, label: $localize`:@@admin.nav.home:Přehled`, exact: true }],
};

export const ADMIN_DAILY: SideNavGroup = {
  id: 'admin-nav-daily',
  label: $localize`:@@admin.nav.group.daily:Každý den`,
  items: [
    { path: ADMIN_PAYMENTS_PATH, label: $localize`:@@admin.nav.payments:Platby z banky` },
    { path: '/sprava/darci', label: $localize`:@@admin.nav.donors:Dárci` },
    { path: '/sprava/aktuality', label: $localize`:@@admin.nav.news:Aktuality` },
    { path: '/sprava/projekty', label: $localize`:@@admin.nav.projects:Projekty` },
  ],
};

export const ADMIN_OCCASIONAL: SideNavGroup = {
  id: 'admin-nav-occasional',
  label: $localize`:@@admin.nav.group.occasional:Občas`,
  items: [
    {
      path: '/sprava/hromadna-potvrzeni',
      label: $localize`:@@admin.nav.yearlyReceipts:Hromadná potvrzení`,
    },
    { path: '/sprava/o-nas', label: $localize`:@@admin.nav.about:Fotka v sekci O nás` },
    { path: '/sprava/lide-fondu', label: $localize`:@@admin.nav.people:Lidé fondu` },
    { path: '/sprava/spravci', label: $localize`:@@admin.nav.administrators:Správci` },
    { path: '/sprava/prehledy', label: $localize`:@@admin.nav.report:Měsíční e-mail` },
    { path: ADMIN_BACKUPS_PATH, label: $localize`:@@admin.nav.backups:Zálohy` },
    { path: '/sprava/upozorneni', label: $localize`:@@admin.nav.alerts:Upozornění` },
    { path: '/sprava/historie', label: $localize`:@@admin.nav.actions:Historie změn` },
  ],
};

export const ADMIN_TECHNICAL: SideNavGroup = {
  id: 'admin-nav-technical',
  label: $localize`:@@admin.nav.group.technical:Pro technika`,
  items: [
    { path: '/sprava/nastaveni', label: $localize`:@@admin.nav.settings:Nastavení` },
    { path: ADMIN_LOGS_PATH, label: $localize`:@@admin.nav.logs:Logy a diagnostika` },
    {
      path: '/sprava/starsi-symboly',
      label: $localize`:@@admin.nav.symbolClaims:Odpovědi o starších symbolech`,
    },
  ],
};

export const ADMIN_SECTIONS: readonly SideNavGroup[] = [
  ADMIN_OVERVIEW,
  ADMIN_DAILY,
  ADMIN_OCCASIONAL,
  ADMIN_TECHNICAL,
];
