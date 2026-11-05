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
import { APP_TABS, AppTab } from '../../core/navigation/app-tabs';
import { TabMemory } from '../../core/navigation/tab-memory';
import { keepRoomForTabBar } from './tab-bar-room';

@Component({
  selector: 'app-tab-bar',
  templateUrl: './tab-bar.html',
  styleUrl: './tab-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabBar {
  private readonly router = inject(Router);
  protected readonly memory = inject(TabMemory);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');

  protected readonly tabs = APP_TABS;
  protected readonly current = computed(() => this.memory.currentTab()?.id ?? null);
  protected readonly label = $localize`:@@layout.tabs.label:Hlavní sekce`;

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
