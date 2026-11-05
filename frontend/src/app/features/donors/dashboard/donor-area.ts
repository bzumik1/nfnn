/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { pluralCategory } from '../../../core/i18n/plural-category';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { PageFocus } from '../../../core/navigation/page-focus';
import { AccountBadges } from '../../../core/layout/account-badges';
import { AppHeader } from '../../../layout/app-header/app-header';
import { TabBar } from '../../../layout/tab-bar/tab-bar';
import { SideNav, SideNavBadge, SideNavGroup } from '../../../shared/ui/side-nav/side-nav';
import { DonorDonations } from './donor-donations';

const BANK_ACCOUNTS_PATH = '/darce/ucty';

export const DONOR_SECTIONS: readonly SideNavGroup[] = [
  {
    id: 'donor-nav-sections',
    label: null,
    items: [
      { path: '/darce/prehled', label: $localize`:@@donor.nav.overview:Můj přehled` },
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
  items: [{ path: '/sprava', label: $localize`:@@donor.dashboard.admin:Správa` }],
};

@Component({
  selector: 'app-donor-area',
  imports: [RouterOutlet, AppHeader, SideNav, TabBar],
  providers: [DonorDonations],
  templateUrl: './donor-area.html',
  styleUrl: './donor-area.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorArea {
  private readonly donations = inject(DonorDonations);
  private readonly auth = inject(AuthStore);

  private readonly questions = computed(() =>
    questionsBadge(this.donations.accountsWithQuestion().length),
  );
  protected readonly compact = inject(CompactLayout).isCompact;
  protected readonly groups = computed(() => {
    const sections = withBankAccountsBadge(this.questions());
    return this.auth.isAdmin() ? [...sections, DONOR_ADMINISTRATION] : sections;
  });
  protected readonly navLabel = $localize`:@@donor.nav.label:Můj účet`;

  constructor() {
    const badges = inject(AccountBadges);
    effect(() => badges.show(BANK_ACCOUNTS_PATH, this.questions()));
    inject(DestroyRef).onDestroy(() => badges.clear(BANK_ACCOUNTS_PATH));
    this.followNavigations();
  }

  private followNavigations(): void {
    const router = inject(Router);
    const pageFocus = inject(PageFocus);
    const injector = inject(Injector);
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd && pageFocus.movesOnLastNavigation()) {
        const fragment = router.parseUrl(event.urlAfterRedirects).fragment;
        afterNextRender(
          () => {
            const main = host.nativeElement.querySelector<HTMLElement>('main#obsah');
            if (main) {
              pageFocus.follow(main, fragment);
            }
          },
          { injector },
        );
      }
    });
  }
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
