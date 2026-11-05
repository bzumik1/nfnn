import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { SignedOutNotice } from './signed-out-notice';

export const PUBLIC_IDLE_MS = 60 * 60 * 1000;

const INPUT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

@Injectable({ providedIn: 'root' })
export class PublicSessionIdle {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly signedOut = inject(SignedOutNotice);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  private lastInput = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private watching = false;
  private signingOut = false;

  private readonly onInput = () => {
    if (this.expired()) {
      this.signOut();
      return;
    }
    this.lastInput = Date.now();
    this.arm(PUBLIC_IDLE_MS);
  };

  private readonly onVisibility = () => {
    if (this.document.visibilityState === 'visible' && this.expired()) {
      this.signOut();
    }
  };

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    effect(
      () => {
        if (this.store.session() === 'PUBLIC') {
          this.watch();
        } else {
          this.unwatch();
        }
      },
      { injector: this.injector },
    );
  }

  private watch(): void {
    if (this.watching) {
      return;
    }
    this.watching = true;
    this.signingOut = false;
    this.lastInput = Date.now();
    for (const name of INPUT_EVENTS) {
      this.document.addEventListener(name, this.onInput, { capture: true, passive: true });
    }
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.arm(PUBLIC_IDLE_MS);
  }

  private unwatch(): void {
    if (!this.watching) {
      return;
    }
    this.watching = false;
    for (const name of INPUT_EVENTS) {
      this.document.removeEventListener(name, this.onInput, { capture: true });
    }
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private arm(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const left = PUBLIC_IDLE_MS - (Date.now() - this.lastInput);
      if (left > 0) {
        this.arm(left);
      } else {
        this.signOut();
      }
    }, delay);
  }

  private expired(): boolean {
    return Date.now() - this.lastInput >= PUBLIC_IDLE_MS;
  }

  private signOut(): void {
    if (this.signingOut) {
      return;
    }
    this.signingOut = true;
    this.unwatch();
    this.store
      .logout()
      .subscribe(() => void this.router.navigateByUrl('/').then(() => this.signedOut.show()));
  }
}
