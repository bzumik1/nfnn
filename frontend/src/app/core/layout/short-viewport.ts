import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, Signal, signal } from '@angular/core';

import { heightDownQuery } from './breakpoints';

@Injectable({ providedIn: 'root' })
export class ShortViewport {
  private readonly short = signal(false);
  readonly isShort: Signal<boolean> = this.short.asReadonly();

  constructor() {
    const view = inject(DOCUMENT).defaultView;
    if (typeof view?.matchMedia !== 'function') {
      return;
    }
    const query = view.matchMedia(heightDownQuery('short'));
    const follow = (): void => this.short.set(query.matches);
    follow();
    query.addEventListener('change', follow);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', follow));
  }
}
