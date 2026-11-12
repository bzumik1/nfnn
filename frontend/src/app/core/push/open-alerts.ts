import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, Injector, signal, untracked } from '@angular/core';

import { AuthStore } from '../auth/auth-store';

import { openAlertCountOf } from './alert-routes';
import { AppBadge } from './app-badge';
import { OpenAlert, OpenAlertsApi } from './open-alerts-api';
import { SERVICE_WORKER_PUSH } from './service-worker-push';

export const OPEN_ALERTS_REFRESH_GAP_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class OpenAlerts {
  private readonly api = inject(OpenAlertsApi);
  private readonly badge = inject(AppBadge);
  private readonly auth = inject(AuthStore);
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly current = signal<readonly OpenAlert[] | null>(null);
  private started = false;
  private lastReadAt = Number.NEGATIVE_INFINITY;
  private generation = 0;

  readonly alerts = this.current.asReadonly();

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const visible = (): void => {
      if (
        this.auth.isAdmin() &&
        this.document.visibilityState === 'visible' &&
        Date.now() - this.lastReadAt >= OPEN_ALERTS_REFRESH_GAP_MS
      ) {
        this.read();
      }
    };
    this.document.addEventListener('visibilitychange', visible);
    const messages = this.push.messages.subscribe((message) => {
      if (openAlertCountOf(message) !== null && this.auth.isAdmin()) {
        this.read();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', visible);
      messages.unsubscribe();
    });
    effect(
      () => {
        const admin = this.auth.isAdmin();
        untracked(() => (admin ? this.read() : this.forget()));
      },
      { injector: this.injector },
    );
  }

  private read(): void {
    this.lastReadAt = Date.now();
    const generation = ++this.generation;
    this.api.openAlerts().subscribe({
      next: (alerts) => {
        if (generation === this.generation && this.auth.isAdmin()) {
          this.current.set(alerts);
          this.badge.show(alerts.length);
        }
      },
      error: () => undefined,
    });
  }

  private forget(): void {
    this.generation += 1;
    this.current.set(null);
  }
}
