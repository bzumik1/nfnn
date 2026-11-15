/// <reference types="@angular/localize" />

import { Location, NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { APP_DEPTH_KEY, BACK_NAVIGATION, BackTarget } from '../../../core/navigation/back-target';
import { RouteChrome } from '../../../core/navigation/route-chrome';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { AppHeader } from '../../../layout/app-header/app-header';
import { AlertsOffer } from '../alerts/offer/alerts-offer';
import { DIALOG_PRESENTATION } from '../../../shared/ui/dialog/dialog-presentation';
import { SuspendsDialogs } from '../../../shared/ui/dialog/dialog-suspension';
import { SheetHead } from '../../../shared/ui/sheet-head/sheet-head';
import { SideNav } from '../../../shared/ui/side-nav/side-nav';
import { ADMIN_SECTIONS } from './admin-sections';
import { ADMINISTRATION_LOCK } from './administration-lock';
import { FirstDownloadNotice } from './first-download-notice/first-download-notice';

@Component({
  selector: 'app-admin-shell',
  imports: [
    AlertsOffer,
    AppHeader,
    FirstDownloadNotice,
    NgComponentOutlet,
    RouterOutlet,
    SheetHead,
    SideNav,
    SuspendsDialogs,
  ],
  providers: [{ provide: DIALOG_PRESENTATION, useValue: 'sheet' }],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.admin-shell--sheet]': 'sheet()' },
})
export class AdminShell {
  protected readonly groups = ADMIN_SECTIONS;
  protected readonly navLabel = $localize`:@@admin.nav.label:Správa`;
  protected readonly compact = inject(CompactLayout).isCompact;
  protected readonly lock = inject(ADMINISTRATION_LOCK);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly page = viewChild<ElementRef<HTMLElement>>('page');
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly backTarget = inject(BackTarget);
  private readonly chrome = inject(RouteChrome).current;
  private readonly fullScreen = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => framedFullScreen(this.router.routerState.snapshot.root)),
    ),
    { initialValue: framedFullScreen(this.router.routerState.snapshot.root) },
  );
  protected readonly sheet = computed(() => this.compact() && !this.fullScreen());
  protected readonly pageTitle = signal('');
  private entryDepth: number | null = null;
  private focusBeforeLock: Element | null = null;
  private wasLocked = false;

  constructor() {
    if (untracked(this.router.currentNavigation) === null) {
      this.entryDepth = this.keptEntry() ?? depthOf(this.location.getState());
    }
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.keepEntry());
    effect((onCleanup) => {
      const page = this.sheet() ? this.page()?.nativeElement : undefined;
      if (page !== undefined) {
        onCleanup(this.followPageTitle(page));
      }
    });
    effect(() => {
      const locked = this.lock.locked();
      untracked(() => this.followLock(locked));
    });
  }

  protected back(): void {
    this.backTarget.back(this.chrome().parent ?? '/');
  }

  protected close(): void {
    const entry = this.keptEntry() ?? this.entryDepth ?? 0;
    const steps = depthOf(this.location.getState()) - entry + 1;
    if (entry > 0 && steps > 0) {
      this.backTarget.backBy(steps);
    } else {
      void this.router.navigateByUrl('/', { replaceUrl: true, info: BACK_NAVIGATION });
    }
  }

  private followPageTitle(page: HTMLElement): () => void {
    const read = (): void =>
      this.pageTitle.set(page.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    read();
    const observer = new MutationObserver(read);
    observer.observe(page, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }

  private keptEntry(): number | null {
    const kept = stateOf(this.location.getState())[ADMIN_ENTRY_KEY];
    return typeof kept === 'number' && kept >= 0 ? kept : null;
  }

  private keepEntry(): void {
    const kept = this.keptEntry();
    if (kept === null) {
      if (this.router.lastSuccessfulNavigation()?.extras.skipLocationChange) {
        return;
      }
      this.entryDepth ??= depthOf(this.location.getState());
      this.location.replaceState(this.location.path(true), '', {
        ...stateOf(this.location.getState()),
        [ADMIN_ENTRY_KEY]: this.entryDepth,
      });
    } else {
      this.entryDepth = kept;
    }
  }

  private followLock(locked: boolean): void {
    if (locked === this.wasLocked) {
      return;
    }
    this.wasLocked = locked;
    if (locked) {
      const active = this.document.activeElement;
      this.focusBeforeLock = this.page()?.nativeElement.contains(active) ? active : null;
      return;
    }
    const remembered = this.focusBeforeLock;
    this.focusBeforeLock = null;
    afterNextRender(() => this.focusPage(remembered), { injector: this.injector });
  }

  private focusPage(remembered: Element | null): void {
    const page = this.page()?.nativeElement;
    if (page === undefined || this.document.querySelector('dialog[open]')) {
      return;
    }
    if (remembered instanceof HTMLElement && remembered.isConnected && page.contains(remembered)) {
      remembered.focus({ preventScroll: true });
      return;
    }
    const heading = page.querySelector<HTMLElement>('h1');
    if (heading === null) {
      return;
    }
    if (heading.tabIndex < 0 && !heading.hasAttribute('tabindex')) {
      heading.setAttribute('tabindex', '-1');
    }
    heading.focus({ preventScroll: true });
  }
}

const ADMIN_ENTRY_KEY = 'nfnnAdminEntry';

function stateOf(state: unknown): Record<string, unknown> {
  return typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
}

function depthOf(state: unknown): number {
  const depth = stateOf(state)[APP_DEPTH_KEY];
  return typeof depth === 'number' && depth > 0 ? depth : 0;
}

function framedFullScreen(root: ActivatedRouteSnapshot): boolean {
  let route: ActivatedRouteSnapshot | null = root;
  while (route?.firstChild) {
    route = route.firstChild;
  }
  return route?.data['adminFrame'] === 'full';
}
