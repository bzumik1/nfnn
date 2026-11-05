import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Injector, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { isPublicActivity, publicActivity, SESSION_CHANNEL, SessionChannel } from './session-tabs';
import { SignedOutNotice } from './signed-out-notice';

export const PUBLIC_IDLE_MS = 60 * 60 * 1000;
export const PUBLIC_ACTIVITY_KEY = 'nfnn.public-activity';
export const PUBLIC_ACTIVITY_SHARE_MS = 60 * 1000;

const INPUT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

@Injectable({ providedIn: 'root' })
export class PublicSessionIdle {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly signedOut = inject(SignedOutNotice);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly openChannel = inject(SESSION_CHANNEL);

  private lastInput = 0;
  private lastShared = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private channel: SessionChannel | null = null;
  private started = false;
  private watching = false;
  private signingOut = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unwatch());
  }

  private readonly onInput = () => {
    if (this.expired()) {
      this.signOut();
      return;
    }
    const now = Date.now();
    this.noteInput(now);
    if (now - this.lastShared >= PUBLIC_ACTIVITY_SHARE_MS) {
      this.lastShared = now;
      this.channel?.postMessage(publicActivity(now));
    }
  };

  private readonly onMessage = (event: MessageEvent) => {
    const message: unknown = event.data;
    if (isPublicActivity(message) && message.at > this.lastInput && message.at <= Date.now()) {
      this.noteInput(message.at);
    }
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
    this.lastInput = storedActivity() ?? Date.now();
    if (this.expired()) {
      this.signOut();
      return;
    }
    storeActivity(this.lastInput);
    for (const name of INPUT_EVENTS) {
      this.document.addEventListener(name, this.onInput, { capture: true, passive: true });
    }
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.channel = this.openChannel();
    this.channel?.addEventListener('message', this.onMessage as EventListener);
    this.arm(PUBLIC_IDLE_MS - (Date.now() - this.lastInput));
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
    this.channel?.close();
    this.channel = null;
    clearTimeout(this.timer);
    this.timer = undefined;
    forgetActivity();
  }

  private noteInput(at: number): void {
    this.lastInput = at;
    storeActivity(at);
    this.arm(PUBLIC_IDLE_MS - (Date.now() - at));
  }

  private arm(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        const left = PUBLIC_IDLE_MS - (Date.now() - this.lastInput);
        if (left > 0) {
          this.arm(left);
        } else {
          this.signOut();
        }
      },
      Math.max(delay, 0),
    );
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

function storedActivity(): number | null {
  try {
    const stored = Number(sessionStorage.getItem(PUBLIC_ACTIVITY_KEY) ?? Number.NaN);
    return Number.isFinite(stored) && stored <= Date.now() ? stored : null;
  } catch {
    return null;
  }
}

function storeActivity(at: number): void {
  try {
    sessionStorage.setItem(PUBLIC_ACTIVITY_KEY, String(at));
  } catch {
    return;
  }
}

function forgetActivity(): void {
  try {
    sessionStorage.removeItem(PUBLIC_ACTIVITY_KEY);
  } catch {
    return;
  }
}
