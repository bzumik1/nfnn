/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthStore } from '../../../../core/auth/auth-store';
import { SESSION_JAR } from '../../../../core/auth/session-jar';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import { BrowserPushHolders } from '../../../operations/browser-push-holders';
import { pushAvailability } from '../../../../core/push/push-availability';
import {
  DevicePushSubscription,
  SERVICE_WORKER_PUSH,
} from '../../../../core/push/service-worker-push';
import { Dialog } from '../../../../shared/ui/dialog/dialog';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { AdminApi, AdminPushResponse } from '../../admin-api';
import { ADMINISTRATION_LOCK } from '../../shell/administration-lock';
import { DeviceAlertMarks } from '../device-alert-marks';

type OfferStep = 'offer' | 'turning-on' | 'on' | 'refused' | 'failed';

const SUBSCRIPTION_LIMIT = 'operations/push-subscription-limit';
const ALERTS_PAGE = '/sprava/upozorneni';

@Component({
  selector: 'app-alerts-offer',
  imports: [Dialog, NeedsConnection, RouterLink],
  templateUrl: './alerts-offer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertsOffer {
  private readonly jar = inject(SESSION_JAR);
  private readonly lock = inject(ADMINISTRATION_LOCK);
  private readonly connectivity = inject(Connectivity);
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly holders = inject(BrowserPushHolders);
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly marks = inject(DeviceAlertMarks);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');
  private readonly navigated = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => true),
    ),
    { initialValue: this.router.navigated },
  );

  protected readonly step = signal<OfferStep | null>(null);
  protected readonly testSent = signal(false);
  protected readonly failure = signal('');
  private publicKey = '';
  private checked = false;

  constructor() {
    effect(() => {
      const ready =
        this.jar.installed &&
        this.navigated() &&
        !this.lock.locked() &&
        !this.connectivity.offline();
      if (ready && !this.checked) {
        this.checked = true;
        untracked(() => this.check());
      }
    });
  }

  protected turnOn(): void {
    if (this.step() === 'turning-on') {
      return;
    }
    const permission = this.push.requestPermission();
    this.step.set('turning-on');
    this.failure.set('');
    void permission.then((answer) => {
      if (answer !== 'granted') {
        this.refused();
        return;
      }
      this.push.requestSubscription(this.publicKey).then(
        (device) => this.register(device, true),
        () => this.refused(),
      );
    });
  }

  protected putOff(): void {
    this.marks.hideOffer();
    this.step.set(null);
  }

  protected dismiss(): void {
    if (this.step() === 'offer') {
      this.putOff();
      return;
    }
    this.step.set(null);
  }

  protected close(): void {
    this.step.set(null);
  }

  private check(): void {
    if (
      this.router.url.startsWith(ALERTS_PAGE) ||
      this.marks.offerHidden() ||
      pushAvailability(this.window, this.push) !== 'available'
    ) {
      return;
    }
    this.api
      .push()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => void this.decide(view),
        error: () => undefined,
      });
  }

  private async decide(view: AdminPushResponse): Promise<void> {
    const donorId = this.auth.donor()?.id;
    if (
      !donorId ||
      view.deviceSession !== true ||
      view.subscriptions.some((item) => item.current)
    ) {
      return;
    }
    this.publicKey = view.publicKey;
    if (this.permission() === 'granted' && (await this.marks.ownedBy(donorId))) {
      this.push.requestSubscription(this.publicKey).then(
        (device) => this.register(device, false),
        () => undefined,
      );
      return;
    }
    this.step.set('offer');
  }

  private register(device: DevicePushSubscription, asked: boolean): void {
    this.api
      .subscribePush({
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const donorId = this.auth.donor()?.id;
          if (donorId) {
            void this.marks.markOwner(donorId);
          }
          if (asked) {
            this.sendTest();
          }
        },
        error: (failure: unknown) => {
          void this.holders
            .donorNotificationsHere()
            .then((held) => (held ? undefined : this.push.unsubscribe()));
          if (asked) {
            this.failure.set(
              problemTypeEndsWith(failure, SUBSCRIPTION_LIMIT)
                ? $localize`:@@admin.alerts.offer.limit:Upozornění můžete mít zapnutá nejvýš na 10 zařízeních. Na stránce Upozornění odeberte to, které už nepoužíváte, a zkuste to znovu.`
                : describeProblem(
                    failure,
                    $localize`:@@admin.alerts.offer.failed:Upozornění se nepodařilo zapnout. Zkuste to prosím znovu.`,
                  ),
            );
            this.show('failed');
          }
        },
      });
  }

  private sendTest(): void {
    this.api
      .testPush()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.testSent.set(true);
          this.show('on');
        },
        error: () => {
          this.testSent.set(false);
          this.show('on');
        },
      });
  }

  private refused(): void {
    this.marks.hideOffer();
    this.show('refused');
  }

  private show(step: OfferStep): void {
    this.step.set(step);
    afterNextRender(() => this.title()?.nativeElement.focus(), { injector: this.injector });
  }

  private permission(): string {
    try {
      return (
        (this.window as (Window & { Notification?: { permission: string } }) | null)?.Notification
          ?.permission ?? 'default'
      );
    } catch {
      return 'default';
    }
  }
}
