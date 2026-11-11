/// <reference types="@angular/localize" />

import { Location } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
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
import { AccountSection } from './account-section';
import { DialogHistory } from '../../shared/ui/dialog/dialog-history';
import { AccountBadges } from '../../core/layout/account-badges';
import { AppInstall } from '../../core/install/app-install';

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
  imports: [Dialog, AccountSection],
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
  private readonly location = inject(Location);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  protected readonly section = signal<AccountItem | null>(null);
  protected readonly depth = computed(() => (this.section() === null ? 0 : 1));
  protected readonly backLabel = $localize`:@@layout.header.back:Zpět`;
  protected readonly discardAsked = signal(false);
  private discarding = false;
  private openedFrom: string | null = null;
  protected readonly contactUrl = '/o-nas#kontakt';
  protected readonly privacyUrl = '/zasady-ochrany-osobnich-udaju';

  protected isCurrent(item: AccountItem): boolean {
    const path = pathOf(this.current());
    return path === item.path || path.startsWith(`${item.path}/`);
  }

  constructor() {
    const followInSection = (event: MouseEvent): void => this.followInSection(event);
    this.host.addEventListener('click', followInSection, true);
    inject(DestroyRef).onDestroy(() =>
      this.host.removeEventListener('click', followInSection, true),
    );
  }

  protected follow(event: MouseEvent, url: string): void {
    if (pressedAside(event)) {
      return;
    }
    event.preventDefault();
    const item = sectionAt(url);
    if (item !== null && this.compact() && this.router.url !== url) {
      this.openedFrom = url;
      this.show(item);
      return;
    }
    this.leaveFor(url);
  }

  protected back(): void {
    this.location.back();
  }

  protected steppedBack(): void {
    if (!this.discarding && this.sectionHasUnsavedInput()) {
      this.discardAsked.set(true);
      return;
    }
    this.discarding = false;
    this.leaveSection();
  }

  protected keepWriting(): void {
    this.discardAsked.set(false);
  }

  protected discard(): void {
    this.discardAsked.set(false);
    this.discarding = true;
    this.location.back();
  }

  private sectionHasUnsavedInput(): boolean {
    return this.host.querySelector('.account-section-body form.ng-dirty') !== null;
  }

  private leaveSection(): void {
    const from = this.openedFrom;
    this.section.set(null);
    this.openedFrom = null;
    afterNextRender(
      () => {
        if (from !== null) {
          this.host.querySelector<HTMLElement>(`a[href="${from}"]`)?.focus();
        }
      },
      { injector: this.injector },
    );
  }

  private followInSection(event: MouseEvent): void {
    const link = (event.target as Element | null)?.closest?.('a[href]');
    if (
      this.section() === null ||
      !(link instanceof HTMLAnchorElement) ||
      link.closest('.account-section-body') === null ||
      pressedAside(event)
    ) {
      return;
    }
    const url = link.getAttribute('href') ?? '';
    if (!url.startsWith('/')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const item = sectionAt(url);
    if (item !== null) {
      this.show(item);
    } else {
      this.leaveFor(url);
    }
  }

  private show(item: AccountItem): void {
    this.section.set(item);
    afterNextRender(() => this.host.querySelector<HTMLElement>('#account-section-title')?.focus(), {
      injector: this.injector,
    });
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

function pressedAside(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function sectionAt(url: string): AccountItem | null {
  return ACCOUNT_ITEMS.find((item) => item.path === url) ?? null;
}
