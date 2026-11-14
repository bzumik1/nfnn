import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../auth/auth-store';

interface AdministrationPushView {
  readonly subscriptions?: readonly { readonly current?: boolean }[];
}

interface DonorPushView {
  readonly device?: unknown;
}

@Injectable({ providedIn: 'root' })
export class BrowserPushHolders {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);

  async administrationAlertsHere(): Promise<boolean> {
    if (!this.auth.isAdmin()) {
      return false;
    }
    try {
      const view = await firstValueFrom(
        this.http.get<AdministrationPushView>('/api/admin/operations/push'),
      );
      return (view.subscriptions ?? []).some((subscription) => subscription.current === true);
    } catch {
      return true;
    }
  }

  async donorNotificationsHere(): Promise<boolean> {
    try {
      const view = await firstValueFrom(this.http.get<DonorPushView>('/api/operations/push'));
      return view.device !== null && view.device !== undefined;
    } catch {
      return true;
    }
  }
}
