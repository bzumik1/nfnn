import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { routeOfAlert } from './alert-routes';
import { SERVICE_WORKER_PUSH } from './service-worker-push';

@Injectable({ providedIn: 'root' })
export class AlertNotificationClicks {
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const subscription = this.push.notificationClicks.subscribe(({ data }) => {
      if (this.isTheFocusedTab()) {
        void this.router.navigateByUrl(routeOfAlert(data)).catch(() => false);
      }
    });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  private isTheFocusedTab(): boolean {
    return this.document.visibilityState === 'visible' && this.document.hasFocus();
  }
}
