/// <reference types="@angular/localize" />

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from '../../core/auth/auth-store';
import { initialsOf } from '../../core/auth/initials';
import { SignedOutNotice } from '../../core/auth/signed-out-notice';
import { CompactLayout } from '../../core/layout/compact-layout';
import { pathOf } from '../../core/navigation/app-tabs';
import { APP_DEPTH_KEY, BackTarget } from '../../core/navigation/back-target';
import { Dialog } from '../../shared/ui/dialog/dialog';
import { DialogHistory } from '../../shared/ui/dialog/dialog-history';
import { AccountBadges } from '../../core/layout/account-badges';
import { AppInstall } from '../../core/install/app-install';
import { ACCOUNT_SHEET_STEP } from './account-sheet-return';

export type AccountIcon = 'overview' | 'gifts' | 'receipts' | 'accounts' | 'details' | 'admin';

export interface AccountItem {
  readonly path: string;
  readonly label: string;
  readonly icon: AccountIcon;
}

export const ACCOUNT_ITEMS: readonly AccountItem[] = [
  {
    path: '/darce/prehled',
    label: $localize`:@@layout.account.overview:Můj přehled`,
    icon: 'overview',
  },
  { path: '/darce/dary', label: $localize`:@@layout.account.gifts:Moje dary`, icon: 'gifts' },
  {
    path: '/darce/potvrzeni',
    label: $localize`:@@layout.account.receipts:Potvrzení o daru`,
    icon: 'receipts',
  },
  {
    path: '/darce/ucty',
    label: $localize`:@@layout.account.bankAccounts:Bankovní účty`,
    icon: 'accounts',
  },
  {
    path: '/darce/udaje',
    label: $localize`:@@layout.account.details:Údaje a zabezpečení`,
    icon: 'details',
  },
];

export const ADMINISTRATION_ITEM: AccountItem = {
  path: '/sprava',
  label: $localize`:@@layout.account.admin:Správa`,
  icon: 'admin',
};

@Component({
  selector: 'app-account-sheet',
  imports: [Dialog],
  templateUrl: './account-sheet.html',
  styleUrl: './account-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSheet {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly history = inject(DialogHistory);
  private readonly backTarget = inject(BackTarget);
  private readonly signedOut = inject(SignedOutNotice);

  readonly portrait = input<string | null>(null);
  readonly closed = output<void>();

  private readonly compact = inject(CompactLayout).isCompact;
  protected readonly presentation = computed(() => (this.compact() ? 'sheet' : 'centered'));
  protected readonly donor = this.auth.donor;
  protected readonly initials = computed(() => initialsOf(this.donor()?.name ?? ''));
  protected readonly sections = ACCOUNT_ITEMS.filter((item) => item.icon !== 'details');
  protected readonly detailsItem = ACCOUNT_ITEMS.find((item) => item.icon === 'details')!;
  protected readonly administrationItem = ADMINISTRATION_ITEM;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly badges = inject(AccountBadges);
  protected readonly signingOut = signal(false);
  protected readonly adminNote = $localize`:@@layout.account.adminNote:jen správci`;
  private readonly install = inject(AppInstall);
  protected readonly installWay = this.install.way;
  protected readonly installHowShown = signal(false);

  protected readonly current = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly contactUrl = '/o-nas#kontakt';
  protected readonly privacyUrl = '/zasady-ochrany-osobnich-udaju';

  protected isCurrent(item: AccountItem): boolean {
    const path = pathOf(this.current());
    return path === item.path || path.startsWith(`${item.path}/`);
  }

  protected follow(event: MouseEvent, url: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.openFromSheet(url);
  }

  protected addToHomeScreen(): void {
    if (this.installWay() === 'prompt') {
      this.closed.emit();
      void this.install.install();
      return;
    }
    this.installHowShown.update((shown) => !shown);
  }

  protected signOut(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.auth.logout().subscribe(() => {
      this.leaveFor('/');
      this.signedOut.show();
    });
  }

  protected close(): void {
    this.closed.emit();
  }

  private openFromSheet(url: string): void {
    if (this.router.url === url) {
      this.closed.emit();
      return;
    }
    this.history.keepStep(ACCOUNT_SHEET_STEP);
    this.closed.emit();
    void this.router.navigateByUrl(url);
  }

  private leaveFor(url: string): void {
    if (this.router.url === url) {
      this.closed.emit();
      return;
    }
    const depth = this.backTarget.nextDepth();
    const handedOver = this.history.handOver(url);
    this.closed.emit();
    if (handedOver) {
      void this.router.navigateByUrl(url, { replaceUrl: true, state: { [APP_DEPTH_KEY]: depth } });
    } else {
      void this.router.navigateByUrl(url);
    }
  }
}
