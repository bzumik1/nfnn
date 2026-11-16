import { DOCUMENT, ViewportScroller } from '@angular/common';
import { inject, Injectable, Provider } from '@angular/core';
import { ScrollHold } from './scroll-hold';

const LESS_MOTION = '(prefers-reduced-motion: reduce)';

type Offset = () => [number, number];

@Injectable()
export class SmoothAnchorScroller implements ViewportScroller {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly hold = inject(ScrollHold);
  private offset: Offset = () => [0, 0];

  setOffset(offset: [number, number] | Offset): void {
    this.offset = Array.isArray(offset) ? () => offset : offset;
  }

  getScrollPosition(): [number, number] {
    return [this.window?.scrollX ?? 0, this.window?.scrollY ?? 0];
  }

  scrollToPosition([left, top]: [number, number], options?: ScrollOptions): void {
    this.hold.run(() => this.window?.scrollTo({ ...options, left, top }));
  }

  scrollToAnchor(anchor: string, options?: ScrollOptions): void {
    this.hold.run(() => this.glideTo(anchor, options));
  }

  setHistoryScrollRestoration(scrollRestoration: 'auto' | 'manual'): void {
    try {
      if (this.window !== null) {
        this.window.history.scrollRestoration = scrollRestoration;
      }
    } catch {
      return;
    }
  }

  private glideTo(anchor: string, options?: ScrollOptions): void {
    const target =
      this.document.getElementById(anchor) ?? this.document.getElementsByName(anchor)[0] ?? null;
    if (target === null || this.window === null) {
      return;
    }
    const box = target.getBoundingClientRect();
    const [offsetLeft, offsetTop] = this.offset();
    this.window.scrollTo({
      ...options,
      behavior: this.lessMotion() ? 'instant' : (options?.behavior ?? 'smooth'),
      left: box.left + this.window.scrollX - offsetLeft,
      top: box.top + this.window.scrollY - offsetTop,
    });
    target.focus({ preventScroll: true });
  }

  private lessMotion(): boolean {
    return this.window?.matchMedia?.(LESS_MOTION).matches ?? false;
  }
}

export function provideSmoothAnchorScrolling(): Provider {
  return { provide: ViewportScroller, useClass: SmoothAnchorScroller };
}
