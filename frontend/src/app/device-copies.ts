import { EnvironmentInjector, inject, Injectable } from '@angular/core';
import type { PrfReading } from './core/device/crypto/prf';
import type { DeviceAccount, SessionDevice, SignInSecret } from './core/auth/session-device';

@Injectable({ providedIn: 'root' })
export class DeviceCopies implements SessionDevice {
  private readonly injector = inject(EnvironmentInjector);
  private loading: Promise<SessionDevice> | null = null;

  prfInput(): Promise<Uint8Array<ArrayBuffer> | null> {
    const input = this.vault()
      .then((vault) => vault.prfInput())
      .catch(() => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>(
      (resolve) => (timer = setTimeout(() => resolve(null), PRF_INPUT_WAIT_MS)),
    );
    return Promise.race([input, late]).finally(() => clearTimeout(timer));
  }

  signedIn(account: DeviceAccount, secret: SignInSecret, storeNothing = false): Promise<void> {
    return this.vault().then(
      (vault) => vault.signedIn(account, secret, storeNothing),
      (failure: unknown) => {
        if (secret.kind === 'prf') {
          secret.reading.output.fill(0);
        }
        throw failure;
      },
    );
  }

  restored(account: DeviceAccount, storeNothing = false): Promise<void> {
    return this.vault().then((vault) => vault.restored(account, storeNothing));
  }

  signedOut(account: DeviceAccount): Promise<void> {
    return this.vault().then((vault) => vault.signedOut(account));
  }

  signedOutElsewhere(): void {
    void this.loading?.then((vault) => vault.signedOutElsewhere());
  }

  sessionLost(): Promise<void> {
    if (!holdsDeviceCopy()) {
      return Promise.resolve();
    }
    return this.vault().then((vault) => vault.sessionLost());
  }

  passwordChanged(account: DeviceAccount, password: string): Promise<void> {
    return this.vault().then((vault) => vault.passwordChanged(account, password));
  }

  passwordRemoved(account: DeviceAccount): Promise<void> {
    return this.vault().then((vault) => vault.passwordRemoved(account));
  }

  passkeyAdded(account: DeviceAccount, reading: PrfReading): Promise<void> {
    return this.vault().then(
      (vault) => vault.passkeyAdded(account, reading),
      (failure: unknown) => {
        reading.output.fill(0);
        throw failure;
      },
    );
  }

  private vault(): Promise<SessionDevice> {
    if (this.loading === null) {
      const loading = Promise.all([
        import('./core/device/store/device-vault'),
        import('./features/donations/device-copy/donor-copy-sync'),
      ]).then(([vault, sync]) => {
        this.injector.get(sync.DonorCopySync);
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

const DEVICE_COPY_MARKER_KEY = 'nfnn.device-copy';
const PRF_INPUT_WAIT_MS = 1500;

function holdsDeviceCopy(): boolean {
  try {
    return localStorage.getItem(DEVICE_COPY_MARKER_KEY) === '1';
  } catch {
    return true;
  }
}
