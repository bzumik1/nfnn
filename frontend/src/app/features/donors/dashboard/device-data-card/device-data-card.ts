/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { deviceAccountOf } from '../../../../core/auth/session-device';
import { SignedOutNotice } from '../../../../core/auth/signed-out-notice';
import { DeviceVault } from '../../../../core/device/store/device-vault';
import { Connectivity } from '../../../../core/navigation/connectivity';
import { LiveNotice, type Notice } from '../../../../shared/ui/live-notice/live-notice';
import { DonorCopyDownload } from '../../../donations/device-copy/donor-copy-download';
import { formatBankTime } from '../../../donations/donation-date';
import { DeleteDeviceDataDialog } from './delete-device-data-dialog';

@Component({
  selector: 'app-device-data-card',
  imports: [DeleteDeviceDataDialog, LiveNotice],
  templateUrl: './device-data-card.html',
  styleUrl: './device-data-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceDataCard {
  private readonly auth = inject(AuthStore);
  private readonly vault = inject(DeviceVault);
  private readonly download = inject(DonorCopyDownload);
  private readonly connectivity = inject(Connectivity);
  private readonly router = inject(Router);
  private readonly signedOut = inject(SignedOutNotice);

  protected readonly reloading = signal(false);
  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly offline = signal(false);

  protected readonly memoryOnly = computed(() => this.vault.mode() === 'memory');
  protected readonly storedAt = computed(() => {
    const contents = this.vault.opened()?.store.contents();
    return contents === null || contents === undefined ? null : formatBankTime(contents.storedAt);
  });
  protected readonly saving = computed(
    () => this.vault.opened() !== null && this.storedAt() === null && this.download.downloading(),
  );

  reload(): void {
    if (this.reloading() || this.deleting()) {
      return;
    }
    if (this.connectivity.isOffline()) {
      this.offline.set(true);
      return;
    }
    this.offline.set(false);
    this.reloading.set(true);
    this.notice.set(null);
    void this.download.reload().then((outcome) => {
      this.reloading.set(false);
      this.notice.set(
        outcome === 'stored'
          ? {
              kind: 'status',
              text: $localize`:@@donor.deviceData.reloaded:Data jsou načtená znovu.`,
            }
          : {
              kind: 'alert',
              text: $localize`:@@donor.deviceData.reloadFailed:Data se nepodařilo načíst. Zkontrolujte připojení a zkuste to prosím znovu.`,
            },
      );
    });
  }

  askToDelete(): void {
    this.notice.set(null);
    this.confirming.set(true);
  }

  cancelDelete(): void {
    if (!this.deleting()) {
      this.confirming.set(false);
    }
  }

  confirmDelete(): void {
    const donor = this.auth.donor();
    if (this.deleting() || donor === null) {
      return;
    }
    this.deleting.set(true);
    void this.vault
      .forget(deviceAccountOf(donor))
      .catch(() => undefined)
      .then(() => {
        this.auth.logout().subscribe(() => {
          this.confirming.set(false);
          void this.router.navigateByUrl('/').then(() => this.signedOut.show());
        });
      });
  }
}
