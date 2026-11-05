/// <reference types="@angular/localize" />

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { SignedInDevice } from '../../../../core/auth/donor';
import { formatBankTime, formatDonationDate, pragueDay } from '../../../donations/donation-date';
import { deviceName } from './device-labels';

const UNAUTHENTICATED = 'auth/unauthenticated';
const ALL_OTHERS = 'others';

@Component({
  selector: 'app-devices-card',
  templateUrl: './devices-card.html',
  styleUrl: './devices-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevicesCard {
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);

  readonly sessionEnded = output<void>();

  protected readonly devices = signal<SignedInDevice[] | null>(null);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly signingOut = signal<string | null>(null);
  protected readonly signedOut = signal('');
  protected readonly hasOthers = computed(() =>
    (this.devices() ?? []).some((device) => !device.current),
  );
  protected readonly signingOutOthers = computed(() => this.signingOut() === ALL_OTHERS);

  constructor() {
    this.loadDevices();
  }

  loadDevices(): void {
    this.loadError.set('');
    this.authApi.devices().subscribe({
      next: (list) => this.devices.set(list.items),
      error: (failure: unknown) => {
        if (this.sessionLost(failure)) {
          return;
        }
        this.loadError.set(
          describeProblem(
            failure,
            $localize`:@@donor.account.devices.error.load:Přihlášená zařízení se nepodařilo načíst.`,
          ),
        );
      },
    });
  }

  signOut(device: SignedInDevice): void {
    if (this.signingOut() !== null) {
      return;
    }
    this.begin(device.id);
    this.authApi.signOutDevice(device.id).subscribe({
      next: () => {
        this.signingOut.set(null);
        this.devices.update((list) => (list ?? []).filter((other) => other.id !== device.id));
        this.signedOut.set(
          $localize`:@@donor.account.devices.signedOut:${this.name(device)}:device: je odhlášené. Pokud jste to nebyli vy, změňte si heslo.`,
        );
      },
      error: (failure: unknown) => this.failed(failure),
    });
  }

  signOutOthers(): void {
    if (this.signingOut() !== null) {
      return;
    }
    this.begin(ALL_OTHERS);
    this.authApi.signOutOtherDevices().subscribe({
      next: () => {
        this.signingOut.set(null);
        this.devices.update((list) => (list ?? []).filter((device) => device.current));
        this.signedOut.set(
          $localize`:@@donor.account.devices.othersSignedOut:Ostatní zařízení jsou odhlášená.`,
        );
      },
      error: (failure: unknown) => this.failed(failure),
    });
  }

  protected name(device: SignedInDevice): string {
    return deviceName(device);
  }

  protected signOutLabel(device: SignedInDevice): string | null {
    if (this.signingOut() === device.id) {
      return null;
    }
    return $localize`:@@donor.account.devices.signOutLabel:Odhlásit ${this.name(device)}:device:`;
  }

  protected signedInOn(device: SignedInDevice): string {
    return formatDonationDate(pragueDay(device.signedInAt));
  }

  protected lastUsed(device: SignedInDevice): string {
    return formatBankTime(device.lastUsedAt);
  }

  private begin(target: string): void {
    this.signingOut.set(target);
    this.actionError.set('');
    this.signedOut.set('');
  }

  private failed(failure: unknown): void {
    this.signingOut.set(null);
    if (this.sessionLost(failure)) {
      return;
    }
    this.actionError.set(
      describeProblem(
        failure,
        $localize`:@@donor.account.devices.error.signOut:Zařízení se nepodařilo odhlásit. Zkuste to prosím znovu.`,
      ),
    );
  }

  private sessionLost(failure: unknown): boolean {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
      this.sessionEnded.emit();
      return true;
    }
    return false;
  }
}
