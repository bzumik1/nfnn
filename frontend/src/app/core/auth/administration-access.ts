import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { DirtyForms } from '../updates/dirty-forms';

export const ADMINISTRATION_LOCK_AFTER_MS = 5 * 60 * 1000;

export const ACCESS_CLOCK = new InjectionToken<() => number>('ACCESS_CLOCK', {
  providedIn: 'root',
  factory: () => () => performance.now(),
});

@Injectable({ providedIn: 'root' })
export class AdministrationAccess {
  private readonly document = inject(DOCUMENT);
  private readonly dirtyForms = inject(DirtyForms);
  private readonly now = inject(ACCESS_CLOCK);
  private readonly open = signal(false);
  private readonly pageKept = signal(false);
  private hiddenSince: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly unlocked = this.open.asReadonly();
  readonly keepsPage = computed(() => !this.open() && this.pageKept());

  constructor() {
    const changed = () => this.visibilityChanged();
    this.document.addEventListener('visibilitychange', changed);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', changed);
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
    const since = this.hiddenSince;
    this.hiddenSince = null;
    if (since !== null && this.now() - since >= ADMINISTRATION_LOCK_AFTER_MS) {
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
