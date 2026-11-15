import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { DirtyForms } from '../updates/dirty-forms';

export const ADMINISTRATION_LOCK_AFTER_MS = 5 * 60 * 1000;
export const ADMINISTRATION_PRESENCE_CHECK_MS = 15 * 1000;

export interface AccessInstant {
  readonly monotonic: number;
  readonly wall: number;
}

export const ACCESS_CLOCK = new InjectionToken<() => AccessInstant>('ACCESS_CLOCK', {
  providedIn: 'root',
  factory: () => () => ({ monotonic: performance.now(), wall: Date.now() }),
});

function awayLongEnough(since: AccessInstant, now: AccessInstant): boolean {
  const wallAway = now.wall - since.wall;
  return (
    now.monotonic - since.monotonic >= ADMINISTRATION_LOCK_AFTER_MS ||
    wallAway >= ADMINISTRATION_LOCK_AFTER_MS ||
    wallAway < 0
  );
}

@Injectable({ providedIn: 'root' })
export class AdministrationAccess {
  private readonly document = inject(DOCUMENT);
  private readonly dirtyForms = inject(DirtyForms);
  private readonly now = inject(ACCESS_CLOCK);
  private readonly open = signal(false);
  private readonly pageKept = signal(false);
  private seenAt: AccessInstant | null = null;
  private awayTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceCheck: ReturnType<typeof setInterval> | null = null;

  readonly unlocked = this.open.asReadonly();
  readonly keepsPage = computed(() => !this.open() && this.pageKept());

  constructor() {
    const changed = () => this.visibilityChanged();
    const returned = () => this.lockIfAwayLongEnough();
    const window = this.document.defaultView;
    this.document.addEventListener('visibilitychange', changed);
    this.document.addEventListener('resume', returned);
    window?.addEventListener('pageshow', returned);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', changed);
      this.document.removeEventListener('resume', returned);
      window?.removeEventListener('pageshow', returned);
      this.stopWatching();
    });
  }

  signedIn(): void {
    this.unlock();
  }

  ended(): void {
    this.stopWatching();
    this.open.set(false);
    this.pageKept.set(false);
  }

  unlock(): void {
    this.pageKept.set(false);
    this.open.set(true);
    this.watchFromNow();
  }

  lock(): void {
    if (!this.open()) {
      return;
    }
    this.stopWatching();
    this.pageKept.set(this.dirtyForms.any());
    this.open.set(false);
  }

  private visibilityChanged(): void {
    this.lockIfAwayLongEnough();
    if (this.open()) {
      this.watchFromNow();
    }
  }

  private presenceChecked(): void {
    this.lockIfAwayLongEnough();
    if (this.open()) {
      this.seenAt = this.now();
    }
  }

  private watchFromNow(): void {
    this.stopWatching();
    this.seenAt = this.now();
    if (this.document.visibilityState === 'hidden') {
      this.awayTimer = setTimeout(() => this.lock(), ADMINISTRATION_LOCK_AFTER_MS);
      return;
    }
    this.presenceCheck = setInterval(
      () => this.presenceChecked(),
      ADMINISTRATION_PRESENCE_CHECK_MS,
    );
  }

  private lockIfAwayLongEnough(): void {
    const since = this.seenAt;
    if (this.open() && since !== null && awayLongEnough(since, this.now())) {
      this.lock();
    }
  }

  private stopWatching(): void {
    if (this.awayTimer !== null) {
      clearTimeout(this.awayTimer);
      this.awayTimer = null;
    }
    if (this.presenceCheck !== null) {
      clearInterval(this.presenceCheck);
      this.presenceCheck = null;
    }
    this.seenAt = null;
  }
}
