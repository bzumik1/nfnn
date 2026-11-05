import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { AccountBadges } from '../../../core/layout/account-badges';
import { AppHeader } from '../../../layout/app-header/app-header';
import { TabBar } from '../../../layout/tab-bar/tab-bar';
import { SideNav } from '../../../shared/ui/side-nav/side-nav';
import { DonorDonations } from './donor-donations';
import {
  BANK_ACCOUNTS_PATH,
  DONOR_NAV_LABEL,
  donorSectionGroups,
  questionsBadge,
} from './donor-sections';
import { DonorSignOut } from './sign-out/donor-sign-out';
import { InstallRow } from './install-row/install-row';

@Component({
  selector: 'app-donor-area',
  imports: [RouterOutlet, AppHeader, SideNav, TabBar, DonorSignOut, InstallRow],
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
  protected readonly groups = computed(() =>
    donorSectionGroups(this.auth.isAdmin(), this.questions()),
  );
  protected readonly navLabel = DONOR_NAV_LABEL;

  constructor() {
    const badges = inject(AccountBadges);
    effect(() => badges.show(BANK_ACCOUNTS_PATH, this.questions()));
    inject(DestroyRef).onDestroy(() => badges.clear(BANK_ACCOUNTS_PATH));
  }
}
