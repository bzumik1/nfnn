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
    const key = `nfnn.reload.${reason}`;
    const now = String(Date.now());
    try {
      const storage = this.storage();
      if (this.reloadedRecently(storage.getItem(key))) {
        return false;
      }
      storage.setItem(key, now);
      return storage.getItem(key) === now;
    } catch {
      return false;
    }
  }

  private reloadedRecently(stored: string | null): boolean {
    const elapsed = Date.now() - Number(stored);
    return stored !== null && elapsed >= 0 && elapsed < RELOAD_WINDOW_MS;
  }
}
