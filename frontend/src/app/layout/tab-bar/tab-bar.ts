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
  signal,
  viewChild,
} from '@angular/core';
import { SoftKeyboard } from '../../core/layout/soft-keyboard';
import { APP_TABS, AppTab, AppTabId } from '../../core/navigation/app-tabs';
import { BackTarget } from '../../core/navigation/back-target';
import { RouteChrome } from '../../core/navigation/route-chrome';
import { TabMemory } from '../../core/navigation/tab-memory';
import { FOUNDATION_STAR } from '../../shared/ui/foundation-star/foundation-star';
import { followFingerAcrossTabs } from './finger-across-tabs';
import { keepRoomForTabBar } from './tab-bar-room';

const CLICK_AFTER_DRAG_MS = 400;

@Component({
  selector: 'app-tab-bar',
  templateUrl: './tab-bar.html',
  styleUrl: './tab-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabBar {
  protected readonly star = FOUNDATION_STAR;
  protected readonly starGlyphViewBox = '1238.5 130.6 553 553';
  protected readonly memory = inject(TabMemory);
  protected readonly keyboard = inject(SoftKeyboard);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  private readonly pill = viewChild.required<ElementRef<HTMLElement>>('pill');

  protected readonly tabs = APP_TABS;
  protected readonly current = computed(() => this.memory.currentTab()?.id ?? null);
  protected readonly dragging = signal(false);
  protected readonly underFinger = signal<AppTabId | null>(null);
  private readonly chosen = signal<AppTabId | null>(null);
  protected readonly shown = computed(() => this.chosen() ?? this.current());
  private draggedAt = Number.NEGATIVE_INFINITY;
  private readonly chrome = inject(RouteChrome).current;
  protected readonly onDark = computed(() => this.chrome().head !== 'light');
  protected readonly label = $localize`:@@layout.tabs.label:Hlavní sekce`;
  private readonly backTarget = inject(BackTarget);

  constructor() {
    let release: (() => void) | null = null;
    let releaseFinger: (() => void) | null = null;
    afterNextRender(() => {
      const bar = this.bar().nativeElement;
      release = keepRoomForTabBar(this.document, bar);
      releaseFinger = followFingerAcrossTabs(bar, this.pill().nativeElement, {
        started: () => this.dragging.set(true),
        moved: (index) => this.underFinger.set(this.tabs[index ?? -1]?.id ?? null),
        released: (index) => this.letGo(index),
      });
    });
    inject(DestroyRef).onDestroy(() => {
      release?.();
      releaseFinger?.();
    });
  }

  protected hrefOf(tab: AppTab): string {
    return this.memory.urlFor(tab);
  }

  protected open(event: MouseEvent, tab: AppTab): void {
    if (event.timeStamp - this.draggedAt < CLICK_AFTER_DRAG_MS) {
      event.preventDefault();
      return;
    }
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
    void this.memory.open(tab);
  }

  private letGo(index: number | null): void {
    this.dragging.set(false);
    this.underFinger.set(null);
    this.draggedAt = this.window?.performance.now() ?? 0;
    const tab = index === null ? undefined : this.tabs[index];
    if (tab === undefined || tab.id === this.current()) {
      return;
    }
    this.chosen.set(tab.id);
    void this.memory.open(tab).finally(() => this.chosen.set(null));
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
