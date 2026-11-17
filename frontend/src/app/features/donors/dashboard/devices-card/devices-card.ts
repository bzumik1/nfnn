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
import { neighbourAfterRowLeaves } from '../../../../shared/ui/leaving-row/leaving-row';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { DevicePlatform, SignedInDevice } from '../../../../core/auth/donor';
import { formatBankTime, formatDonationDate, pragueDay } from '../../../donations/donation-date';
import { BusyAnnouncement } from '../../../../shared/ui/busy-label/busy-announcement';
import { BusyLabel } from '../../../../shared/ui/busy-label/busy-label';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { ListChanges } from '../../../../core/kept/list-changes';
import { KeptDonorAnswers } from '../kept-donor-answers';
import { DonorNotifiedDevices } from '../../../operations/donor-notified-devices';
import { groupDevices } from './device-groups';
import { deviceName, deviceNameInSentence, sessionKindName } from './device-labels';

const UNAUTHENTICATED = 'auth/unauthenticated';
const DEVICE_NOT_FOUND = 'donors/device-not-found';
const ALL_OTHERS = 'others';
const ROW_CONTROLS = '.device-sign-out, .devices-older-toggle';

function signOutButtonId(deviceId: string): string {
  return `device-sign-out-${deviceId}`;
}

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
  providers: [BusyAnnouncement],
  imports: [BusyLabel, NeedsConnection, NgTemplateOutlet],
  templateUrl: './devices-card.html',
  styleUrl: './devices-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevicesCard {
  protected readonly busyAnnouncement = inject(BusyAnnouncement);
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly kept = inject(KeptDonorAnswers);
  private readonly notifiedDevices = inject(DonorNotifiedDevices);
  private readonly changes = new ListChanges(() => this.loadDevices(false, true));
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly deviceList = viewChild<ElementRef<HTMLElement>>('deviceList');
  private readonly othersButton = viewChild<ElementRef<HTMLButtonElement>>('othersButton');
  private readonly confirmCancel = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');

  readonly sessionEnded = output<void>();

  protected readonly devices = signal<SignedInDevice[] | null>(null);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly olderShown = signal(false);
  protected readonly groups = computed(() => groupDevices(this.devices() ?? []));
  protected readonly shown = computed(() => [...this.groups().current, ...this.groups().recent]);
  protected readonly confirming = signal<string | null>(null);
  protected readonly signingOut = signal<string | null>(null);
  protected readonly signedOut = signal('');
  protected readonly hasOthers = computed(() =>
    (this.devices() ?? []).some((device) => !device.current),
  );
  protected readonly signingOutOthers = computed(() => this.signingOut() === ALL_OTHERS);
  protected readonly confirmingOthers = computed(() => this.confirming() === ALL_OTHERS);
  private readonly rowLeft = signal(false);
  protected readonly emptyEntrance = computed(() =>
    this.rowLeft() ? 'devices-empty--after-rows' : '',
  );

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

  askToSignOut(device: SignedInDevice): void {
    this.ask(device.id);
  }

  askToSignOutOthers(): void {
    this.ask(ALL_OTHERS);
  }

  cancelSignOut(): void {
    const target = this.confirming();
    this.confirming.set(null);
    this.focusAfterRender(() => this.askingButton(target));
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
        this.failed(failure, () => this.askingButton(device.id));
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
        this.confirming.set(null);
        this.rowLeft.set(true);
        this.devices.update((list) => (list ?? []).filter((device) => device.current));
        this.signedOut.set(
          this.auth.isAdmin()
            ? $localize`:@@donor.account.devices.othersSignedOutAdmin:Ostatní zařízení jsou odhlášená. Připojené aplikace zůstávají připojené; odpojíte je v\u00a0kartě „Připojené aplikace“.`
            : $localize`:@@donor.account.devices.othersSignedOut:Ostatní zařízení jsou odhlášená.`,
        );
        this.focusAfterRender(() => this.title().nativeElement);
        this.changes.changed();
      },
      error: (failure: unknown) => this.failed(failure, () => this.askingButton(ALL_OTHERS)),
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

  protected nameInSentence(device: SignedInDevice): string {
    return deviceNameInSentence(device);
  }

  protected kind(device: SignedInDevice): string | null {
    return sessionKindName(device);
  }

  protected shape(device: SignedInDevice): DeviceShape {
    return SHAPES[device.platform];
  }

  protected signOutLabel(device: SignedInDevice): string {
    return $localize`:@@donor.account.devices.signOutLabel:Odhlásit ${this.nameInSentence(device)}:device:`;
  }

  protected signOutButtonId(device: SignedInDevice): string {
    return signOutButtonId(device.id);
  }

  protected rowId(device: SignedInDevice): string {
    return `device-row-${device.id}`;
  }

  protected confirmQuestionId(device: SignedInDevice): string {
    return `device-sign-out-confirm-${device.id}`;
  }

  protected signedInOn(device: SignedInDevice): string {
    return formatDonationDate(pragueDay(device.signedInAt));
  }

  protected lastUsed(device: SignedInDevice): string {
    return formatBankTime(device.lastUsedAt);
  }

  private removed(device: SignedInDevice): void {
    const neighbour = neighbourAfterRowLeaves(
      this.document.getElementById(this.rowId(device)),
      this.deviceList()?.nativeElement.querySelectorAll<HTMLElement>(ROW_CONTROLS) ?? [],
    );
    this.signingOut.set(null);
    this.confirming.set(null);
    this.rowLeft.set(true);
    this.devices.update((list) => (list ?? []).filter((other) => other.id !== device.id));
    this.signedOut.set(
      $localize`:@@donor.account.devices.signedOut:Zařízení jsme odhlásili: ${this.nameInSentence(device)}:device:. Pokud jste se na něm nepřihlásili vy, změňte si heslo.`,
    );
    this.focusAfterRender(() => neighbour() ?? this.title().nativeElement);
    this.changes.changed();
  }

  private ask(target: string): void {
    if (this.signingOut() !== null) {
      return;
    }
    this.confirming.set(target);
    this.focusAfterRender(() => this.confirmCancel()?.nativeElement);
  }

  private askingButton(target: string | null): HTMLElement | null | undefined {
    if (target === ALL_OTHERS) {
      return this.othersButton()?.nativeElement;
    }
    return target === null ? null : this.document.getElementById(signOutButtonId(target));
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
    this.confirming.set(null);
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
