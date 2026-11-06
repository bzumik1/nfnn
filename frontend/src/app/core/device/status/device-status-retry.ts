import { effect, inject, Injectable, Injector, untracked } from '@angular/core';
import { SESSION_DEVICE } from '../../auth/session-device';
import { Connectivity } from '../../connectivity/connectivity';

@Injectable({ providedIn: 'root' })
export class DeviceStatusRetry {
  private readonly injector = inject(Injector);
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const connectivity = this.injector.get(Connectivity);
    const device = this.injector.get(SESSION_DEVICE);
    let wasOffline = untracked(() => connectivity.offline());
    effect(
      () => {
        const offline = connectivity.offline();
        if (wasOffline && !offline) {
          untracked(() => void device.connectionReturned?.());
        }
        wasOffline = offline;
      },
      { injector: this.injector },
    );
  }
}
