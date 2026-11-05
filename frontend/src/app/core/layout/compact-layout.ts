import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, Signal, signal } from '@angular/core';

import { BREAKPOINTS, downQuery } from './breakpoints';

const DEFAULT_ROOT_FONT_PX = 16;

@Injectable({ providedIn: 'root' })
export class CompactLayout {
  private readonly compact = signal(false);
  private readonly narrowForText = signal(false);
  readonly isCompact: Signal<boolean> = this.compact.asReadonly();
  readonly listsAsRows: Signal<boolean> = computed(() => this.compact() || this.narrowForText());

  constructor() {
    const document = inject(DOCUMENT);
    const view = document.defaultView;
    if (typeof view?.matchMedia !== 'function') {
      return;
    }
    const query = view.matchMedia(downQuery('nav'));
    const rootFontPx = (): number =>
      parseFloat(view.getComputedStyle?.(document.documentElement).fontSize ?? '') ||
      DEFAULT_ROOT_FONT_PX;
    const follow = (): void => {
      this.compact.set(query.matches);
      this.narrowForText.set(
        view.innerWidth <= (BREAKPOINTS.nav * rootFontPx()) / DEFAULT_ROOT_FONT_PX,
      );
    };
    follow();
    query.addEventListener('change', follow);
    view.addEventListener?.('resize', follow);
    const probe = this.textSizeProbe(document, view, follow);
    inject(DestroyRef).onDestroy(() => {
      query.removeEventListener('change', follow);
      view.removeEventListener?.('resize', follow);
      probe?.disconnect();
      probe?.element.remove();
    });
  }

  private textSizeProbe(
    document: Document,
    view: Window,
    follow: () => void,
  ): { element: HTMLElement; disconnect: () => void } | null {
    const Observer = (view as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (typeof Observer !== 'function' || !document.body) {
      return null;
    }
    const element = document.createElement('div');
    element.setAttribute('aria-hidden', 'true');
    element.style.cssText =
      'position: absolute; visibility: hidden; pointer-events: none; width: 1rem; height: 0; overflow: hidden';
    document.body.append(element);
    const observer = new Observer(follow);
    observer.observe(element);
    return { element, disconnect: () => observer.disconnect() };
  }
}
