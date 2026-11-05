/// <reference types="@angular/localize" />

import { pluralCategory } from '../../../core/i18n/plural-category';
import { SideNavBadge, SideNavGroup } from '../../../shared/ui/side-nav/side-nav';
import { SectionIcon, SectionRowGroup } from '../../../shared/ui/section-rows/section-rows';

export const OVERVIEW_PATH = '/darce/prehled';
export const BANK_ACCOUNTS_PATH = '/darce/ucty';
export const ADMINISTRATION_PATH = '/sprava';

export const DONOR_SECTIONS: readonly SideNavGroup[] = [
  {
    id: 'donor-nav-sections',
    label: null,
    items: [
      { path: OVERVIEW_PATH, label: $localize`:@@donor.nav.overview:Můj přehled` },
      { path: '/darce/dary', label: $localize`:@@donor.nav.gifts:Moje dary` },
      { path: '/darce/potvrzeni', label: $localize`:@@donor.nav.receipts:Potvrzení o daru` },
      { path: BANK_ACCOUNTS_PATH, label: $localize`:@@donor.nav.bankAccounts:Bankovní účty` },
      { path: '/darce/udaje', label: $localize`:@@donor.nav.details:Údaje a zabezpečení` },
    ],
  },
];

export const DONOR_ADMINISTRATION: SideNavGroup = {
  id: 'donor-nav-administration',
  label: $localize`:@@donor.nav.administration:Pro správce`,
  items: [{ path: ADMINISTRATION_PATH, label: $localize`:@@donor.dashboard.admin:Správa` }],
};

export const DONOR_NAV_LABEL = $localize`:@@donor.nav.label:Můj účet`;

const SECTION_ICONS: Readonly<Record<string, SectionIcon>> = {
  '/darce/dary': 'gifts',
  '/darce/potvrzeni': 'receipts',
  [BANK_ACCOUNTS_PATH]: 'accounts',
  '/darce/udaje': 'details',
  [ADMINISTRATION_PATH]: 'admin',
};

export function donorSectionGroups(
  isAdmin: boolean,
  questions: SideNavBadge,
): readonly SideNavGroup[] {
  const sections = DONOR_SECTIONS.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.path === BANK_ACCOUNTS_PATH ? { ...item, badge: questions } : item,
    ),
  }));
  return isAdmin ? [...sections, DONOR_ADMINISTRATION] : sections;
}

export function donorSectionRows(groups: readonly SideNavGroup[]): readonly SectionRowGroup[] {
  return groups.map((group) => ({
    id: `${group.id}-rows`,
    label: group.label ?? DONOR_NAV_LABEL,
    rows: group.items
      .filter((item) => item.path !== OVERVIEW_PATH)
      .map((item) => ({ ...item, icon: SECTION_ICONS[item.path] })),
  }));
}

export function questionsBadge(count: number): SideNavBadge {
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
