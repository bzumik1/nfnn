/// <reference types="@angular/localize" />

import { ALERT_AREA_NAMES, faultRoute } from '../../core/push/alert-areas';
import { OpenAlerts } from '../../core/push/open-alerts';
import { formatBankTime } from '../../features/donations/donation-date';
import { Location } from '@angular/common';
import {
  afterNextRender,
  AnimationCallbackEvent,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
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
import { APP_ACCOUNT_KEY } from './account-return';
import { Dialog } from '../../shared/ui/dialog/dialog';
import { Appearance, AppearanceChoice } from '../../core/appearance/appearance';
import { AccountSection } from './account-section';
import { DialogAnnouncer } from '../../shared/ui/dialog/dialog-announcer';
import { DialogHistory } from '../../shared/ui/dialog/dialog-history';
import { AccountBadges } from '../../core/layout/account-badges';
import { AppInstall } from '../../core/install/app-install';
import { SheetHead } from '../../shared/ui/sheet-head/sheet-head';

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
    label: $localize`:@@layout.account.receipts:Potvrzení o\u00a0daru`,
    icon: 'receipts',
  },
  {
    path: '/darce/ucty',
    label: $localize`:@@layout.account.bankAccounts:Bankovní účty`,
    icon: 'accounts',
  },
  {
    path: '/darce/udaje',
    label: $localize`:@@layout.account.details:Údaje a\u00a0zabezpečení`,
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
  imports: [Dialog, AccountSection, SheetHead],
  templateUrl: './account-sheet.html',
  styleUrl: './account-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.account-sheet--push]': "move() === 'push'",
    '[class.account-sheet--pop]': "move() === 'pop'",
  },
})
export class AccountSheet {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly history = inject(DialogHistory);
  private readonly backTarget = inject(BackTarget);
  private readonly signedOut = inject(SignedOutNotice);

  readonly portrait = input<string | null>(null);
  readonly reopenedOn = input<string | null>(null);
  readonly closed = output<void>();

  private readonly compact = inject(CompactLayout).isCompact;
  protected readonly presentation = computed(() => (this.compact() ? 'sheet' : 'centered'));
  protected readonly showsLogo = this.compact;
  protected readonly donor = this.auth.donor;
  protected readonly initials = computed(() => initialsOf(this.donor()?.name ?? ''));
  protected readonly sections = ACCOUNT_ITEMS.filter((item) => item.icon !== 'details');
  protected readonly detailsItem = ACCOUNT_ITEMS.find((item) => item.icon === 'details')!;
  protected readonly administrationItem = ADMINISTRATION_ITEM;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly badges = inject(AccountBadges);
  private readonly openAlerts = inject(OpenAlerts).alerts;
  protected readonly faults = computed(() => (this.isAdmin() ? (this.openAlerts() ?? []) : []));
  protected readonly faultPath = computed(() => faultRoute(this.faults()));
  protected readonly faultTitle = computed(() => {
    const faults = this.faults();
    return faults.length === 1
      ? $localize`:@@layout.account.faults.single:Nefunguje: ${ALERT_AREA_NAMES[faults[0].area]}:area:`
      : $localize`:@@layout.account.faults.several:Poruchy: ${faults.length}:count:`;
  });
  protected readonly faultMeta = computed(() => {
    const faults = this.faults();
    return faults.length === 1
      ? $localize`:@@layout.account.faults.since:od ${formatBankTime(faults[0].since)}:since:`
      : faults.map((fault) => ALERT_AREA_NAMES[fault.area]).join(', ');
  });
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
  private readonly trail = linkedSignal<AccountItem[]>(() => {
    const item = sectionAt(this.reopenedOn() ?? '');
    return item === null ? [] : [item];
  });
  protected readonly section = computed(() => this.trail().at(-1) ?? null);
  protected readonly depth = computed(() => this.trail().length);
  protected readonly steps = computed(() => {
    const section = this.section();
    return [{ key: section?.path ?? '', section }];
  });
  protected readonly move = signal<'push' | 'pop' | null>(null);
  private readonly dialog = viewChild.required(Dialog);
  protected readonly discardAsked = signal<'back' | 'close' | null>(null);
  private discarding = false;
  protected readonly appearance = inject(Appearance);
  protected readonly appearanceLabel = computed(() => APPEARANCE_LABELS[this.appearance.choice()]);
  private readonly announcer = inject(DialogAnnouncer);
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
    afterNextRender(() => {
      if (this.reopenedOn() !== null) {
        this.standAtOnce();
      }
    });
  }

  protected follow(event: MouseEvent, url: string): void {
    if (pressedAside(event)) {
      return;
    }
    event.preventDefault();
    const item = sectionAt(url);
    if (item !== null && this.compact() && this.router.url !== url) {
      this.move.set('push');
      this.trail.set([item]);
      this.focusSectionTitle();
      return;
    }
    this.leaveFor(url);
  }

  protected back(): void {
    this.location.back();
  }

  protected closeSection(): void {
    if (this.sectionHasUnsavedInput()) {
      this.discardAsked.set('close');
      return;
    }
    this.dialog().dismiss();
  }

  protected steppedBack(): void {
    if (!this.discarding && this.sectionHasUnsavedInput()) {
      this.discardAsked.set('back');
      return;
    }
    this.discarding = false;
    this.leaveSection();
  }

  protected keepWriting(): void {
    this.discardAsked.set(null);
  }

  protected discard(): void {
    const leaving = this.discardAsked();
    this.discardAsked.set(null);
    if (leaving === 'close') {
      this.dialog().dismiss();
      return;
    }
    this.discarding = true;
    this.location.back();
  }

  private sectionHasUnsavedInput(): boolean {
    return (
      this.host.querySelector('.account-step:not([inert]) .account-section-body form.ng-dirty') !==
      null
    );
  }

  private leaveSection(): void {
    const left = this.section();
    this.move.set('pop');
    this.trail.update((trail) => trail.slice(0, -1));
    afterNextRender(
      () => {
        if (left !== null) {
          this.linkTo(left.path)?.focus();
        }
      },
      { injector: this.injector },
    );
  }

  private standAtOnce(): void {
    const dialog = this.host.querySelector('dialog');
    if (dialog !== null && typeof dialog.getAnimations === 'function') {
      dialog
        .getAnimations({ subtree: true })
        .filter((motion) => motion.effect?.getComputedTiming().endTime !== Infinity)
        .forEach((motion) => motion.finish());
    }
    const left = this.backTarget.leftPath;
    const link = left === null ? null : this.linkTo(left);
    if (link !== null) {
      link.focus();
    } else if (this.section() !== null) {
      this.host.querySelector<HTMLElement>('#account-section-title')?.focus();
    }
  }

  private linkTo(path: string): HTMLAnchorElement | null {
    return (
      Array.from(this.host.querySelectorAll<HTMLAnchorElement>('a[href]')).find(
        (link) =>
          pathOf(link.getAttribute('href') ?? '') === path && link.closest('[inert]') === null,
      ) ?? null
    );
  }

  protected stepLeaves(event: AnimationCallbackEvent): void {
    leaveAccountStep(event);
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
    if (item === this.section()) {
      return;
    }
    if (item !== null) {
      this.move.set('push');
      this.trail.update((trail) => [...trail, item]);
      this.focusSectionTitle();
    } else {
      this.leaveFor(url);
    }
  }

  private focusSectionTitle(): void {
    afterNextRender(() => this.host.querySelector<HTMLElement>('#account-section-title')?.focus(), {
      injector: this.injector,
    });
  }

  protected nextAppearance(): void {
    const next = NEXT_APPEARANCE[this.appearance.choice()];
    this.appearance.choose(next);
    this.announcer.announce(APPEARANCE_LABELS[next]);
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
      this.leaveFor('/', false);
      this.signedOut.show();
    });
  }

  protected close(): void {
    this.closed.emit();
  }

  private leaveFor(url: string, returnsHere = true): void {
    if (this.router.url === url) {
      this.closed.emit();
      return;
    }
    const depth = this.backTarget.nextDepth();
    const account =
      returnsHere && this.compact() ? { [APP_ACCOUNT_KEY]: this.section()?.path ?? '' } : null;
    const handedOver = this.history.handOver(url);
    this.closed.emit();
    if (handedOver) {
      void this.router.navigateByUrl(url, {
        replaceUrl: true,
        state: { [APP_DEPTH_KEY]: depth, ...account },
      });
    } else if (account !== null) {
      void this.router.navigateByUrl(url, { state: account });
    } else {
      void this.router.navigateByUrl(url);
    }
  }
}

const STEP_LEAVE_GRACE_MS = 300;

const APPEARANCE_LABELS: Record<AppearanceChoice, string> = {
  auto: $localize`:@@layout.account.appearance.auto:Vzhled: Automaticky`,
  light: $localize`:@@layout.account.appearance.light:Vzhled: Světlý`,
  dark: $localize`:@@layout.account.appearance.dark:Vzhled: Tmavý`,
};

const NEXT_APPEARANCE: Record<AppearanceChoice, AppearanceChoice> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto',
};

export function leaveAccountStep(event: AnimationCallbackEvent): void {
  const step = event.target;
  step.setAttribute('inert', '');
  step.setAttribute('aria-hidden', 'true');
  step.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  step.classList.add('account-step--leaving');
  const motions = Array.from(step.children).flatMap((part) =>
    typeof part.getAnimations === 'function' ? part.getAnimations() : [],
  );
  if (motions.length === 0) {
    event.animationComplete();
    return;
  }
  let gone = false;
  const leaves = (): void => {
    if (!gone) {
      gone = true;
      clearTimeout(fallback);
      event.animationComplete();
    }
  };
  const longest = Math.max(
    0,
    ...motions
      .map((motion) => Number(motion.effect?.getComputedTiming().endTime ?? 0))
      .filter(Number.isFinite),
  );
  const fallback = setTimeout(leaves, longest + STEP_LEAVE_GRACE_MS);
  void Promise.allSettled(motions.map((motion) => motion.finished)).then(leaves);
}

function pressedAside(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function sectionAt(url: string): AccountItem | null {
  return ACCOUNT_ITEMS.find((item) => item.path === url) ?? null;
}
