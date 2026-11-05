import { afterNextRender, computed, inject, Injectable, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Observable, tap } from 'rxjs';
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
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly leaving = signal(false);

  readonly locked = computed(
    () => (this.auth.isAdmin() || this.leaving()) && !this.access.unlocked(),
  );
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
    const opened = await this.vault
      .unlockAdministrationWithPasskey(account, this.auth.storesNothing())
      .catch(() => false);
    const unlocked = opened && this.stillSignedInAs(account);
    if (unlocked) {
      this.access.unlock();
    }
    return unlocked;
  }

  unlockWithPassword(password: string, code: string): Observable<void> {
    const account = this.account();
    return this.api.unlock(password, code).pipe(
      tap(() => {
        if (account === null || !this.stillSignedInAs(account)) {
          return;
        }
        this.access.unlock();
        void this.vault
          .unlockAdministrationWithPassword(account, password, this.auth.storesNothing())
          .catch(() => undefined);
      }),
    );
  }

  async signOut(): Promise<void> {
    this.leaving.set(true);
    this.access.ended();
    try {
      await this.rendered();
      await firstValueFrom(this.auth.logout()).catch(() => undefined);
      await this.router.navigateByUrl('/');
    } finally {
      this.leaving.set(false);
    }
  }

  private rendered(): Promise<void> {
    return new Promise((resolve) => afterNextRender(() => resolve(), { injector: this.injector }));
  }

  private stillSignedInAs(account: DeviceAccount): boolean {
    return this.auth.isAdmin() && this.account()?.userHandle === account.userHandle;
  }

  private account(): DeviceAccount | null {
    const donor = this.auth.donor();
    return donor === null ? null : deviceAccountOf(donor);
  }
}
