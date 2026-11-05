import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { DirtyForms } from '../updates/dirty-forms';

export const ADMINISTRATION_LOCK_AFTER_MS = 5 * 60 * 1000;

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
  private hiddenSince: AccessInstant | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

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
      this.stopTimer();
    });
  }

  signedIn(): void {
    this.unlock();
  }

  ended(): void {
    this.open.set(false);
    this.pageKept.set(false);
  }

  unlock(): void {
    this.pageKept.set(false);
    this.open.set(true);
  }

  lock(): void {
    if (!this.open()) {
      return;
    }
    this.pageKept.set(this.dirtyForms.any());
    this.open.set(false);
  }

  private visibilityChanged(): void {
    if (this.document.visibilityState === 'hidden') {
      this.hiddenSince = this.now();
      this.stopTimer();
      this.timer = setTimeout(() => this.lock(), ADMINISTRATION_LOCK_AFTER_MS);
      return;
    }
    this.stopTimer();
    this.lockIfAwayLongEnough();
    this.hiddenSince = null;
  }

  private lockIfAwayLongEnough(): void {
    const since = this.hiddenSince;
    if (since !== null && awayLongEnough(since, this.now())) {
      this.lock();
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
