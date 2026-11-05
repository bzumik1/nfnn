import { computed, inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AdministrationAccess } from '../../../core/auth/administration-access';
import { AuthStore } from '../../../core/auth/auth-store';
import { type DeviceAccount, deviceAccountOf } from '../../../core/auth/session-device';
import { DeviceVault } from '../../../core/device/store/device-vault';
import { AdministrationCopyDownload } from '../device-copy/administration-copy-download';
import { AdministrationSyncApi } from '../device-copy/administration-sync-api';

@Injectable({ providedIn: 'root' })
export class AdministrationLockService {
  private readonly auth = inject(AuthStore);
  private readonly access = inject(AdministrationAccess);
  private readonly vault = inject(DeviceVault);
  private readonly api = inject(AdministrationSyncApi);

  readonly locked = computed(() => this.auth.isAdmin() && !this.access.unlocked());
  readonly keepsPage = this.access.keepsPage;
  readonly firstDownload = inject(AdministrationCopyDownload).firstDownload;

  async passkeyUnlocks(): Promise<boolean> {
    const account = this.account();
    if (account === null) {
      return false;
    }
    const passkeys = await this.vault
      .administrationPasskeys(account, this.auth.storesNothing())
      .catch(() => []);
    return passkeys.length > 0;
  }

  async unlockWithPasskey(): Promise<boolean> {
    const account = this.account();
    if (account === null) {
      return false;
    }
    const unlocked = await this.vault
      .unlockAdministrationWithPasskey(account, this.auth.storesNothing())
      .catch(() => false);
    if (unlocked) {
      this.access.unlock();
    }
    return unlocked;
  }

  unlockWithPassword(password: string, code: string): Observable<void> {
    return this.api.unlock(password, code).pipe(
      tap(() => {
        const account = this.account();
        this.access.unlock();
        if (account !== null) {
          void this.vault
            .unlockAdministrationWithPassword(account, password, this.auth.storesNothing())
            .catch(() => undefined);
        }
      }),
    );
  }

  private account(): DeviceAccount | null {
    const donor = this.auth.donor();
    return donor === null ? null : deviceAccountOf(donor);
  }
}
