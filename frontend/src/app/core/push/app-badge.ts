import { DOCUMENT } from '@angular/common';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  Injector,
  untracked,
} from '@angular/core';

import { AuthStore } from '../auth/auth-store';

import { openAlertCountOf } from './alert-routes';
import { SERVICE_WORKER_PUSH } from './service-worker-push';

interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class AppBadge {
  private readonly document = inject(DOCUMENT);
  private readonly navigator = this.document.defaultView?.navigator as
    (Navigator & BadgeNavigator) | undefined;
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private readonly seesNoAlerts = computed(
    () => this.auth.status() !== 'unknown' && !this.auth.waitsSignedOut() && !this.auth.isAdmin(),
  );

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const subscription = this.push.messages.subscribe((message) => {
      const count = openAlertCountOf(message);
      if (count !== null) {
        this.show(count);
      }
    });
    const resumed = (): void => {
      if (this.document.visibilityState === 'visible' && this.seesNoAlerts()) {
        this.show(0);
      }
    };
    this.document.addEventListener('visibilitychange', resumed);
    this.destroyRef.onDestroy(() => {
      subscription.unsubscribe();
      this.document.removeEventListener('visibilitychange', resumed);
    });
    effect(
      () => {
        if (this.seesNoAlerts()) {
          untracked(() => this.show(0));
        }
      },
      { injector: this.injector },
    );
  }

  show(count: number): void {
    const navigator = this.navigator;
    try {
      const pending =
        count > 0
          ? navigator?.setAppBadge?.call(navigator, count)
          : navigator?.clearAppBadge?.call(navigator);
      pending?.catch(() => undefined);
    } catch {
      return;
    }
  }
}
