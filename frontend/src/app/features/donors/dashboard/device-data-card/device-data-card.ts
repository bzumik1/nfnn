/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { deviceAccountOf } from '../../../../core/auth/session-device';
import { SignedOutNotice } from '../../../../core/auth/signed-out-notice';
import { DeviceVault } from '../../../../core/device/store/device-vault';
import { Connectivity } from '../../../../core/navigation/connectivity';
import { LiveNotice, type Notice } from '../../../../shared/ui/live-notice/live-notice';
import { DonorCopySync, type SyncOutcome } from '../../../donations/device-copy/donor-copy-sync';
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
  private readonly copySync = inject(DonorCopySync);
  private readonly connectivity = inject(Connectivity);
  private readonly router = inject(Router);
  private readonly signedOut = inject(SignedOutNotice);

  protected readonly reloading = signal(false);
  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteFailed = signal(false);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly memoryOnly = computed(() => this.vault.mode() === 'memory');
  protected readonly locked = computed(() => this.vault.locked());
  protected readonly storedAt = computed(() => {
    const contents = this.vault.opened()?.store.contents();
    if (contents === null || contents === undefined) {
      return null;
    }
    const shown = formatBankTime(contents.storedAt);
    const split = shown.lastIndexOf(' ');
    return { date: shown.slice(0, split), time: shown.slice(split + 1) };
  });
  protected readonly saving = computed(
    () => this.vault.opened() !== null && this.storedAt() === null && this.copySync.syncing(),
  );

  reload(): void {
    if (this.reloading() || this.deleting()) {
      return;
    }
    if (this.connectivity.isOffline()) {
      this.notice.set({
        kind: 'alert',
        text: $localize`:@@donor.deviceData.needsConnection:Bez připojení k internetu data načíst nejde. Připojte se a zkuste to znovu.`,
      });
      return;
    }
    this.reloading.set(true);
    this.notice.set(null);
    void this.copySync.reload().then((outcome) => {
      this.reloading.set(false);
      this.notice.set(reloadNotice(outcome));
    });
  }

  askToDelete(): void {
    this.notice.set(null);
    this.deleteFailed.set(false);
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
    this.deleteFailed.set(false);
    this.vault.forget(deviceAccountOf(donor)).then(
      () =>
        this.auth.logout().subscribe(() => {
          this.confirming.set(false);
          void this.router
            .navigateByUrl('/')
            .then(() => this.signedOut.show('device-data-deleted'));
        }),
      () => {
        this.deleting.set(false);
        this.deleteFailed.set(true);
      },
    );
  }
}

function reloadNotice(outcome: SyncOutcome): Notice {
  switch (outcome) {
    case 'stored':
      return {
        kind: 'status',
        text: $localize`:@@donor.deviceData.reloaded:Data jsou načtená znovu.`,
      };
    case 'failed':
      return {
        kind: 'alert',
        text: $localize`:@@donor.deviceData.reloadFailed:Data se nepodařilo načíst. Zkontrolujte připojení a zkuste to prosím znovu.`,
      };
    case 'mismatch':
      return {
        kind: 'alert',
        text: $localize`:@@donor.deviceData.reloadUnverified:Data ze serveru se nepodařilo ověřit. Zkuste je prosím za chvíli načíst znovu, a když to nepůjde, napište nám na info@nfnn.cz.`,
      };
    case 'no-copy':
      return {
        kind: 'alert',
        text: $localize`:@@donor.deviceData.reloadFailedOther:Data se nepodařilo načíst. Zkuste to prosím za chvíli znovu, a když to nepůjde, napište nám na info@nfnn.cz.`,
      };
  }
}
