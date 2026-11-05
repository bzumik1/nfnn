import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, Signal, signal } from '@angular/core';

import { downQuery } from './breakpoints';

const NO_WIDTH = 1;

@Injectable({ providedIn: 'root' })
export class CompactLayout {
  private readonly compact = signal(false);
  readonly isCompact: Signal<boolean> = this.compact.asReadonly();

  constructor() {
    const view = inject(DOCUMENT).defaultView;
    if (typeof view?.matchMedia !== 'function') {
      return;
    }
    const query = view.matchMedia(downQuery('nav'));
    const follow = (): void => {
      if (view.innerWidth > NO_WIDTH) {
        this.compact.set(query.matches);
      }
    };
    follow();
    query.addEventListener('change', follow);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', follow));
  }
}
