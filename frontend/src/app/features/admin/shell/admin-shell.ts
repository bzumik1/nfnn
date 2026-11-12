/// <reference types="@angular/localize" />

import { NgComponentOutlet } from '@angular/common';
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
  untracked,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { RouteChrome } from '../../../core/navigation/route-chrome';
import { AppHeader } from '../../../layout/app-header/app-header';
import { TabBar } from '../../../layout/tab-bar/tab-bar';
import { AlertsOffer } from '../alerts/offer/alerts-offer';
import { DIALOG_PRESENTATION } from '../../../shared/ui/dialog/dialog-presentation';
import { SuspendsDialogs } from '../../../shared/ui/dialog/dialog-suspension';
import { SideNav } from '../../../shared/ui/side-nav/side-nav';
import { ADMIN_SECTIONS } from './admin-sections';
import { ADMINISTRATION_LOCK } from './administration-lock';

@Component({
  selector: 'app-admin-shell',
  imports: [
    AlertsOffer,
    AppHeader,
    NgComponentOutlet,
    RouterOutlet,
    SideNav,
    SuspendsDialogs,
    TabBar,
  ],
  providers: [{ provide: DIALOG_PRESENTATION, useValue: 'sheet' }],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShell {
  protected readonly groups = ADMIN_SECTIONS;
  protected readonly navLabel = $localize`:@@admin.nav.label:Správa`;
  protected readonly compact = inject(CompactLayout).isCompact;
  private readonly chrome = inject(RouteChrome).current;
  protected readonly tabBar = computed(() => this.compact() && this.chrome().tabBar);
  protected readonly lock = inject(ADMINISTRATION_LOCK);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly page = viewChild<ElementRef<HTMLElement>>('page');
  private focusBeforeLock: Element | null = null;
  private wasLocked = false;

  constructor() {
    effect(() => {
      const locked = this.lock.locked();
      untracked(() => this.followLock(locked));
    });
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
