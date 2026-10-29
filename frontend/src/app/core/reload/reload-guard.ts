import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';

export type ReloadReason = 'chunk-load';

export const RELOAD_WINDOW_MS = 60_000;

export const SESSION_STORAGE = new InjectionToken<() => Storage>('SESSION_STORAGE', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    return () => {
      if (!view) {
        throw new Error('No window');
      }
      return view.sessionStorage;
    };
  },
});

@Injectable({ providedIn: 'root' })
export class ReloadGuard {
  private readonly storage = inject(SESSION_STORAGE);

  claim(reason: ReloadReason): boolean {
    void this.storage;
    void reason;
    return false;
  }
}
