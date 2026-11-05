import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, Injector } from '@angular/core';

import { AuthStore } from '../auth/auth-store';

import { openAlertCountOf } from './alert-routes';
import { SERVICE_WORKER_PUSH } from './service-worker-push';

interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class AppBadge {
  private readonly navigator = inject(DOCUMENT).defaultView?.navigator as
    (Navigator & BadgeNavigator) | undefined;
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private wasAdmin = false;

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
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
    effect(
      () => {
        const admin = this.auth.isAdmin();
        if (this.wasAdmin && !admin) {
          this.show(0);
        }
        this.wasAdmin = admin;
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
