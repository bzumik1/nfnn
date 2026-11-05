import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import { detectPlatform } from '../errors/client-platform';

export type InstallWay = 'prompt' | 'ios-share' | 'mac-dock' | 'none';
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export const OFFER_HIDDEN_KEY = 'nfnn.install-offer.hidden-until';
export const OFFER_HIDDEN_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class AppInstall {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly deferred = signal<InstallPromptEvent | null>(null);
  private readonly installed = signal(false);
  private readonly hiddenUntil = signal(this.storedHiddenUntil());
  private started = false;

  readonly way = computed<InstallWay>(() => {
    if (this.installed() || this.runsInstalled()) {
      return 'none';
    }
    if (this.deferred() !== null) {
      return 'prompt';
    }
    return this.manualWay();
  });

  readonly offered = computed(() => this.way() !== 'none' && this.hiddenUntil() <= Date.now());

  start(): void {
    const view = this.window;
    if (this.started || !view) {
      return;
    }
    this.started = true;
    const offered = (event: Event): void => {
      event.preventDefault();
      this.deferred.set(event as InstallPromptEvent);
    };
    const done = (): void => {
      this.installed.set(true);
      this.deferred.set(null);
    };
    view.addEventListener('beforeinstallprompt', offered);
    view.addEventListener('appinstalled', done);
    this.destroyRef.onDestroy(() => {
      view.removeEventListener('beforeinstallprompt', offered);
      view.removeEventListener('appinstalled', done);
    });
  }

  async install(): Promise<InstallOutcome> {
    const event = this.deferred();
    if (event === null) {
      return 'unavailable';
    }
    this.deferred.set(null);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') {
        this.installed.set(true);
      }
      return outcome;
    } catch {
      return 'unavailable';
    }
  }

  hideOffer(): void {
    const until = Date.now() + OFFER_HIDDEN_DAYS * DAY_MS;
    this.hiddenUntil.set(until);
    try {
      this.window?.localStorage.setItem(OFFER_HIDDEN_KEY, String(until));
    } catch {
      return;
    }
  }

  private manualWay(): InstallWay {
    const navigator = this.window?.navigator;
    const platform = detectPlatform(
      { userAgent: navigator?.userAgent ?? '', maxTouchPoints: navigator?.maxTouchPoints ?? 0 },
      false,
    );
    if (platform.os === 'ios' || platform.os === 'ipados') {
      return 'ios-share';
    }
    if (platform.os === 'macos' && platform.browser === 'safari') {
      return 'mac-dock';
    }
    return 'none';
  }

  private runsInstalled(): boolean {
    const view = this.window;
    if (!view) {
      return false;
    }
    const homeScreen = (view.navigator as Navigator & { readonly standalone?: boolean }).standalone;
    return (
      homeScreen === true ||
      (typeof view.matchMedia === 'function' &&
        view.matchMedia('(display-mode: standalone)').matches)
    );
  }

  private storedHiddenUntil(): number {
    try {
      const stored = Number(this.window?.localStorage.getItem(OFFER_HIDDEN_KEY) ?? 0);
      return Number.isFinite(stored) ? stored : 0;
    } catch {
      return 0;
    }
  }
}
