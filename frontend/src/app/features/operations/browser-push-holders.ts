import { inject, Injectable, Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../../core/auth/auth-store';
import { DonorPushApi } from './donor-push-api';

@Injectable({ providedIn: 'root' })
export class BrowserPushHolders {
  private readonly donorPush = inject(DonorPushApi);
  private readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);

  async administrationAlertsHere(): Promise<boolean> {
    if (!this.auth.isAdmin()) {
      return false;
    }
    try {
      const { AdminApi } = await import('../admin/admin-api');
      const view = await firstValueFrom(this.injector.get(AdminApi).push());
      return view.subscriptions.some((subscription) => subscription.current);
    } catch {
      return true;
    }
  }

  async donorNotificationsHere(): Promise<boolean> {
    try {
      return (await firstValueFrom(this.donorPush.view())).device !== null;
    } catch {
      return true;
    }
  }
}
