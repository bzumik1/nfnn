import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';

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
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

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
