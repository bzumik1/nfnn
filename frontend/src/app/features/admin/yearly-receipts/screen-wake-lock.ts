import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, InjectionToken } from '@angular/core';

export interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export interface ScreenWakeLocks {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

export const SCREEN_WAKE_LOCKS = new InjectionToken<ScreenWakeLocks | null>('screen wake locks', {
  providedIn: 'root',
  factory: () =>
    (inject(DOCUMENT).defaultView?.navigator as { wakeLock?: ScreenWakeLocks } | undefined)
      ?.wakeLock ?? null,
});

@Injectable()
export class ScreenWakeLock {
  private readonly locks = inject(SCREEN_WAKE_LOCKS);
  private readonly document = inject(DOCUMENT);
  private holding = false;
  private sentinel: WakeLockSentinelLike | null = null;
  private readonly visibilityChanged = () => {
    if (this.document.visibilityState !== 'visible') {
      this.sentinel = null;
      return;
    }
    if (this.holding && this.sentinel === null) {
      this.acquire();
    }
  };

  constructor() {
    this.document.addEventListener('visibilitychange', this.visibilityChanged);
    inject(DestroyRef).onDestroy(() => {
      this.release();
      this.document.removeEventListener('visibilitychange', this.visibilityChanged);
    });
  }

  hold(): void {
    if (this.holding) {
      return;
    }
    this.holding = true;
    this.acquire();
  }

  release(): void {
    this.holding = false;
    const sentinel = this.sentinel;
    this.sentinel = null;
    void sentinel?.release().catch(() => undefined);
  }

  private acquire(): void {
    if (this.locks === null) {
      return;
    }
    let request: Promise<WakeLockSentinelLike>;
    try {
      request = this.locks.request('screen');
    } catch {
      return;
    }
    request.then(
      (sentinel) => {
        if (this.holding) {
          this.sentinel = sentinel;
        } else {
          void sentinel.release().catch(() => undefined);
        }
      },
      () => undefined,
    );
  }
}
