/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { SoftKeyboard } from '../../core/layout/soft-keyboard';
import { APP_TABS, AppTab } from '../../core/navigation/app-tabs';
import { BackTarget } from '../../core/navigation/back-target';
import { RouteChrome } from '../../core/navigation/route-chrome';
import { TabMemory } from '../../core/navigation/tab-memory';
import { FOUNDATION_STAR } from '../../shared/ui/foundation-star/foundation-star';
import { keepRoomForTabBar } from './tab-bar-room';

@Component({
  selector: 'app-tab-bar',
  templateUrl: './tab-bar.html',
  styleUrl: './tab-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabBar {
  protected readonly star = FOUNDATION_STAR;
  private readonly router = inject(Router);
  protected readonly memory = inject(TabMemory);
  protected readonly keyboard = inject(SoftKeyboard);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');

  protected readonly tabs = APP_TABS;
  protected readonly current = computed(() => this.memory.currentTab()?.id ?? null);
  private readonly chrome = inject(RouteChrome).current;
  protected readonly onDark = computed(() => this.chrome().darkThroughout);
  protected readonly label = $localize`:@@layout.tabs.label:Hlavní sekce`;
  private readonly backTarget = inject(BackTarget);

  constructor() {
    let release: (() => void) | null = null;
    afterNextRender(() => {
      release = keepRoomForTabBar(this.document, this.bar().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => release?.());
  }

  protected hrefOf(tab: AppTab): string {
    return this.memory.urlFor(tab);
  }

  protected open(event: MouseEvent, tab: AppTab): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (this.memory.isAtRoot(tab)) {
      this.scrollToTop();
      return;
    }
    if (this.memory.currentTab()?.id === tab.id) {
      this.backTarget.toTabRoot(tab.path);
      return;
    }
    void this.router.navigateByUrl(this.memory.urlFor(tab));
  }

  private scrollToTop(): void {
    const view = this.window;
    if (view === null) {
      return;
    }
    const reduced = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    view.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }
}
