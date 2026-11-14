import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, Injector, signal, untracked } from '@angular/core';

import { Subscription } from 'rxjs';

import { AuthStore } from '../auth/auth-store';
import { AccountBadges } from '../layout/account-badges';

import { faultDescription } from './alert-areas';
import { ALERTS_PAGE, openAlertCountOf } from './alert-routes';
import { AppBadge } from './app-badge';
import { OpenAlert, OpenAlertsApi } from './open-alerts-api';
import { SERVICE_WORKER_PUSH } from './service-worker-push';

export const OPEN_ALERTS_REFRESH_GAP_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class OpenAlerts {
  private readonly api = inject(OpenAlertsApi);
  private readonly badge = inject(AppBadge);
  private readonly accountBadges = inject(AccountBadges);
  private readonly auth = inject(AuthStore);
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly current = signal<readonly OpenAlert[] | null>(null);
  private started = false;
  private lastReadAt = Number.NEGATIVE_INFINITY;
  private generation = 0;
  private reading: Subscription | null = null;
  private readAgain = false;

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

  refresh(): void {
    if (this.auth.isAdmin()) {
      this.read();
    }
  }

  accept(alerts: readonly OpenAlert[]): void {
    if (this.auth.isAdmin()) {
      this.current.set(alerts);
      this.badge.show(alerts.length);
      this.accountBadges.show(ALERTS_PAGE, {
        count: alerts.length,
        description: faultDescription(alerts.length),
      });
    }
  }

  private read(): void {
    this.lastReadAt = Date.now();
    if (this.reading !== null) {
      this.readAgain = true;
      return;
    }
    const generation = this.generation;
    const done = (): void => {
      if (generation !== this.generation) {
        return;
      }
      this.reading = null;
      if (this.readAgain) {
        this.readAgain = false;
        this.read();
      }
    };
    this.reading = this.api.openAlerts().subscribe({
      next: (alerts) => {
        if (generation === this.generation) {
          this.accept(alerts);
        }
      },
      error: done,
      complete: done,
    });
  }

  private forget(): void {
    this.generation += 1;
    this.reading?.unsubscribe();
    this.reading = null;
    this.readAgain = false;
    this.current.set(null);
    this.accountBadges.clear(ALERTS_PAGE);
  }
}
