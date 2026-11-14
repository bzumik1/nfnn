/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { DevicePlatform, SignedInDevice } from '../../../../core/auth/donor';
import { formatBankTime, formatDonationDate, pragueDay } from '../../../donations/donation-date';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { ListChanges } from '../../../../core/kept/list-changes';
import { KeptDonorAnswers } from '../kept-donor-answers';
import { DonorNotifiedDevices } from '../../../operations/donor-notified-devices';
import { groupDevices } from './device-groups';
import { deviceName, sessionKindName } from './device-labels';

const UNAUTHENTICATED = 'auth/unauthenticated';
const DEVICE_NOT_FOUND = 'donors/device-not-found';
const ALL_OTHERS = 'others';

type DeviceShape = 'phone' | 'tablet' | 'computer' | 'other';

const SHAPES: Record<DevicePlatform, DeviceShape> = {
  IPHONE: 'phone',
  ANDROID: 'phone',
  IPAD: 'tablet',
  MAC: 'computer',
  WINDOWS: 'computer',
  CHROMEBOOK: 'computer',
  LINUX: 'computer',
  OTHER: 'other',
};

@Component({
  selector: 'app-devices-card',
  imports: [NeedsConnection, NgTemplateOutlet],
  templateUrl: './devices-card.html',
  styleUrl: './devices-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevicesCard {
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly kept = inject(KeptDonorAnswers);
  private readonly notifiedDevices = inject(DonorNotifiedDevices);
  private readonly changes = new ListChanges(() => this.loadDevices(false, true));
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly othersButton = viewChild<ElementRef<HTMLButtonElement>>('othersButton');
  private readonly olderToggle = viewChild<ElementRef<HTMLButtonElement>>('olderToggle');

  readonly sessionEnded = output<void>();

  protected readonly devices = signal<SignedInDevice[] | null>(null);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly olderShown = signal(false);
  protected readonly groups = computed(() => groupDevices(this.devices() ?? []));
  protected readonly shown = computed(() => [...this.groups().current, ...this.groups().recent]);
  protected readonly signingOut = signal<string | null>(null);
  protected readonly signedOut = signal('');
  protected readonly hasOthers = computed(() =>
    (this.devices() ?? []).some((device) => !device.current),
  );
  protected readonly signingOutOthers = computed(() => this.signingOut() === ALL_OTHERS);

  constructor() {
    this.loadDevices(true);
    effect(() => {
      const devices = this.devices();
      if (devices !== null) {
        this.kept.keep('devices', { items: devices });
      }
    });
  }

  loadDevices(shownBefore = false, quietly = false): void {
    this.loadError.set('');
    const server = this.changes.track(this.authApi.devices());
    const devices = shownBefore ? this.kept.read('devices', server) : server;
    devices.subscribe({
      next: (list) => this.devices.set(list.items),
      error: (failure: unknown) => {
        if (this.sessionLost(failure) || (quietly && this.devices() !== null)) {
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
        this.failed(failure, () => this.document.getElementById(this.signOutButtonId(device)));
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
        this.changes.changed();
      },
      error: (failure: unknown) => this.failed(failure, () => this.othersButton()?.nativeElement),
    });
  }

  toggleOlder(): void {
    this.olderShown.update((shown) => !shown);
  }

  protected notified(device: SignedInDevice): boolean {
    return this.notifiedDevices.ids().has(device.id);
  }

  protected name(device: SignedInDevice): string {
    return deviceName(device);
  }

  protected kind(device: SignedInDevice): string | null {
    return sessionKindName(device);
  }

  protected shape(device: SignedInDevice): DeviceShape {
    return SHAPES[device.platform];
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
    const visible = this.visibleDevices();
    const position = visible.findIndex((other) => other.id === device.id);
    const next = visible.slice(position + 1).find((other) => !other.current);
    this.devices.update((list) => (list ?? []).filter((other) => other.id !== device.id));
    this.signedOut.set(
      $localize`:@@donor.account.devices.signedOut:Zařízení jsme odhlásili: ${this.name(device)}:device:. Pokud jste se na něm nepřihlásili vy, změňte si heslo.`,
    );
    this.focusAfterRender(() =>
      next
        ? this.document.getElementById(this.signOutButtonId(next))
        : (this.olderToggle()?.nativeElement ??
          this.othersButton()?.nativeElement ??
          this.heading().nativeElement),
    );
    this.changes.changed();
  }

  private visibleDevices(): SignedInDevice[] {
    return [...this.shown(), ...(this.olderShown() ? this.groups().older : [])];
  }

  private focusAfterRender(target: () => HTMLElement | null | undefined): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }

  private begin(target: string): void {
    this.changes.changing();
    this.signingOut.set(target);
    this.actionError.set('');
    this.signedOut.set('');
  }

  private failed(failure: unknown, pressed: () => HTMLElement | null | undefined): void {
    this.signingOut.set(null);
    if (this.sessionLost(failure)) {
      return;
    }
    this.changes.changed();
    this.focusAfterRender(pressed);
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
