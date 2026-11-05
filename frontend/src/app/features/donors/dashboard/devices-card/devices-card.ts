/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { SignedInDevice } from '../../../../core/auth/donor';
import { formatBankTime, formatDonationDate, pragueDay } from '../../../donations/donation-date';
import { deviceName } from './device-labels';

const UNAUTHENTICATED = 'auth/unauthenticated';
const DEVICE_NOT_FOUND = 'donors/device-not-found';
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
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly othersButton = viewChild<ElementRef<HTMLButtonElement>>('othersButton');

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
      next: () => this.removed(device),
      error: (failure: unknown) => {
        if (problemTypeEndsWith(failure, DEVICE_NOT_FOUND)) {
          this.removed(device);
          return;
        }
        this.failed(failure);
      },
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
          this.auth.isAdmin()
            ? $localize`:@@donor.account.devices.othersSignedOutAdmin:Ostatní zařízení jsou odhlášená. Připojené aplikace zůstávají připojené; odpojíte je na kartě Připojené aplikace.`
            : $localize`:@@donor.account.devices.othersSignedOut:Ostatní zařízení jsou odhlášená.`,
        );
        this.focusAfterRender(() => this.heading().nativeElement);
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

  protected signOutButtonId(device: SignedInDevice): string {
    return `device-sign-out-${device.id}`;
  }

  protected signedInOn(device: SignedInDevice): string {
    return formatDonationDate(pragueDay(device.signedInAt));
  }

  protected lastUsed(device: SignedInDevice): string {
    return formatBankTime(device.lastUsedAt);
  }

  private removed(device: SignedInDevice): void {
    this.signingOut.set(null);
    const list = this.devices() ?? [];
    const position = list.findIndex((other) => other.id === device.id);
    const remaining = list.filter((other) => other.id !== device.id);
    const next = remaining.slice(position).find((other) => !other.current);
    this.devices.set(remaining);
    this.signedOut.set(
      $localize`:@@donor.account.devices.signedOut:Zařízení jsme odhlásili: ${this.name(device)}:device:. Pokud jste se na něm nepřihlásili vy, změňte si heslo.`,
    );
    this.focusAfterRender(() =>
      next
        ? this.document.getElementById(this.signOutButtonId(next))
        : (this.othersButton()?.nativeElement ?? this.heading().nativeElement),
    );
  }

  private focusAfterRender(target: () => HTMLElement | null | undefined): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
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
