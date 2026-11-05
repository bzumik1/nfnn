import { EnvironmentInjector, inject, Injectable } from '@angular/core';
import type { PrfReading } from './core/device/crypto/prf';
import type { DeviceAccount, SessionDevice, SignInSecret } from './core/auth/session-device';

@Injectable({ providedIn: 'root' })
export class DeviceCopies implements SessionDevice {
  private readonly injector = inject(EnvironmentInjector);
  private loading: Promise<SessionDevice> | null = null;

  prfInput(): Promise<Uint8Array<ArrayBuffer> | null> {
    return this.vault()
      .then((vault) => vault.prfInput())
      .catch(() => null);
  }

  signedIn(account: DeviceAccount, secret: SignInSecret): Promise<void> {
    return this.vault().then((vault) => vault.signedIn(account, secret));
  }

  restored(account: DeviceAccount): Promise<void> {
    return this.vault().then((vault) => vault.restored(account));
  }

  signedOut(account: DeviceAccount): Promise<void> {
    return this.vault().then((vault) => vault.signedOut(account));
  }

  signedOutElsewhere(): void {
    void this.loading?.then((vault) => vault.signedOutElsewhere());
  }

  endedRemotely(account: DeviceAccount): Promise<void> {
    return this.vault().then((vault) => vault.endedRemotely(account));
  }

  passwordChanged(account: DeviceAccount, password: string): Promise<void> {
    return this.vault().then((vault) => vault.passwordChanged(account, password));
  }

  passwordRemoved(account: DeviceAccount): Promise<void> {
    return this.vault().then((vault) => vault.passwordRemoved(account));
  }

  passkeyAdded(account: DeviceAccount, reading: PrfReading): Promise<void> {
    return this.vault().then((vault) => vault.passkeyAdded(account, reading));
  }

  private vault(): Promise<SessionDevice> {
    if (this.loading === null) {
      const loading = Promise.all([
        import('./core/device/store/device-vault'),
        import('./features/donations/device-copy/donor-copy-download'),
      ]).then(([vault, download]) => {
        this.injector.get(download.DonorCopyDownload);
        return this.injector.get(vault.DeviceVault);
      });
      this.loading = loading;
      loading.catch(() => {
        if (this.loading === loading) {
          this.loading = null;
        }
      });
    }
    return this.loading;
  }
}
