import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';

import { AppBadge } from '../../../core/push/app-badge';
import { AdminApi } from '../admin-api';

export const ALERT_BADGE_REFRESH_GAP_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class AlertBadgeRefresh {
  private readonly api = inject(AdminApi);
  private readonly badge = inject(AppBadge);
  private readonly document = inject(DOCUMENT);
  private lastReadAt = Number.NEGATIVE_INFINITY;

  watch(destroyRef: DestroyRef): void {
    let closed = false;
    const shown = (count: number): void => {
      if (!closed) {
        this.badge.show(count);
      }
    };
    this.read(shown);
    const visible = (): void => {
      if (
        this.document.visibilityState === 'visible' &&
        Date.now() - this.lastReadAt >= ALERT_BADGE_REFRESH_GAP_MS
      ) {
        this.read(shown);
      }
    };
    this.document.addEventListener('visibilitychange', visible);
    destroyRef.onDestroy(() => {
      closed = true;
      this.document.removeEventListener('visibilitychange', visible);
    });
  }

  private read(shown: (count: number) => void): void {
    this.lastReadAt = Date.now();
    this.api.push().subscribe({
      next: (view) => shown(view.openAlerts?.length ?? 0),
      error: () => undefined,
    });
  }
}
