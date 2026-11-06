/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
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
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from '../../core/auth/auth-store';
import { LoginDialogService } from '../../core/auth/login-dialog.service';
import { CompactLayout } from '../../core/layout/compact-layout';
import { BackTarget } from '../../core/navigation/back-target';
import { RouteChrome } from '../../core/navigation/route-chrome';
import { followScrollEdge } from './scroll-edge';
import { initialsOf } from '../../core/auth/initials';
import { AccountBadges } from '../../core/layout/account-badges';
import { AccountPortrait } from '../account-sheet/account-portrait';
import { AccountSheet } from '../account-sheet/account-sheet';
import { AccountSheetReturn } from '../account-sheet/account-sheet-return';

@Component({
  selector: 'app-header',
  imports: [RouterLink, AccountSheet],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  private readonly loginDialog = inject(LoginDialogService);
  private readonly backTarget = inject(BackTarget);
  private readonly chrome = inject(RouteChrome).current;
  private readonly injector = inject(Injector);
  private readonly header = viewChild.required<ElementRef<HTMLElement>>('header');

  protected readonly auth = inject(AuthStore);
  private readonly compact = inject(CompactLayout).isCompact;
  protected readonly parent = computed(() => {
    const chrome = this.chrome();
    return this.compact() || chrome.backOnWide ? chrome.parent : null;
  });
  protected readonly showsLogo = computed(() => this.parent() === null);
  protected readonly onDark = computed(() => this.chrome().head !== 'light');
  protected readonly onPhoto = computed(() => this.chrome().head === 'photo');
  protected readonly initials = computed(() => initialsOf(this.auth.donor()?.name ?? ''));
  private readonly router = inject(Router);
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => pathOf(this.router.url)),
    ),
    { initialValue: pathOf(this.router.url) },
  );
  private readonly badges = inject(AccountBadges);
  protected readonly accountBadge = computed(() => this.badges.total(this.path()));
  private readonly portraits = inject(AccountPortrait);
  protected readonly portrait = this.portraits.url;
  protected readonly accountOpen = linkedSignal({
    source: () => this.auth.signedIn(),
    computation: () => false,
  });
  protected readonly backLabel = $localize`:@@layout.header.back:Zpět`;

  constructor() {
    const document = inject(DOCUMENT);
    let releaseScrollEdge: (() => void) | null = null;
    afterNextRender(() => {
      releaseScrollEdge = followScrollEdge(document, this.header().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => releaseScrollEdge?.());
    const sheetReturn = inject(AccountSheetReturn);
    effect(() => {
      if (sheetReturn.wanted()) {
        untracked(() => {
          sheetReturn.taken();
          if (this.auth.signedIn()) {
            this.accountOpen.set(true);
          }
        });
      }
    });
    effect(() => {
      if (this.auth.donor() !== null && this.auth.isAdmin()) {
        untracked(() => this.portraits.ask());
      }
    });
  }

  protected back(): void {
    const parent = this.parent();
    if (parent !== null) {
      this.backTarget.back(parent);
    }
  }

  protected openLogin(): void {
    this.loginDialog.open('login', { afterSignIn: () => this.focusAccount() });
  }

  protected openAccount(): void {
    this.accountOpen.set(true);
  }

  protected closeAccount(): void {
    this.accountOpen.set(false);
  }

  private focusAccount(): void {
    afterNextRender(
      () => {
        const header = this.header().nativeElement;
        (header.querySelector<HTMLElement>('button.account-button') ?? header).focus();
      },
      { injector: this.injector },
    );
  }
}

function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}
