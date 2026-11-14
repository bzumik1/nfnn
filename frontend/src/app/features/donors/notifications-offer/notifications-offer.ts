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

import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { SESSION_JAR } from '../../../core/auth/session-jar';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { pushAvailability } from '../../../core/push/push-availability';
import { SERVICE_WORKER_PUSH } from '../../../core/push/service-worker-push';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { DonorDonationsRepository } from '../../donations/device-copy/donor-donations-repository';
import { PaymentHandOffs } from '../../donations/payment-panel/payment-hand-offs';
import { BrowserPushHolders } from '../../operations/browser-push-holders';
import { DonorPushApi } from '../../operations/donor-push-api';

type OfferStep = 'offer' | 'turning-on' | 'on' | 'refused' | 'failed';

export const NOTIFICATIONS_OFFER_HIDDEN_KEY = 'nfnn.notifications-offer.hidden-until';
export const NOTIFICATIONS_OFFER_HIDDEN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const HAND_OFF_COUNTS_MS = 2 * 60 * 60 * 1000;
const SUBSCRIPTION_LIMIT = 'operations/push-subscription-limit';
const ADMINISTRATION = '/sprava';

@Component({
  selector: 'app-notifications-offer',
  imports: [Dialog, NeedsConnection, RouterLink],
  templateUrl: './notifications-offer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsOffer {
  private readonly jar = inject(SESSION_JAR);
  private readonly auth = inject(AuthStore);
  private readonly connectivity = inject(Connectivity);
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly api = inject(DonorPushApi);
  private readonly holders = inject(BrowserPushHolders);
  private readonly donations = inject(DonorDonationsRepository);
  private readonly handOffs = inject(PaymentHandOffs);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
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
  private offeredOnStart = false;
  private checking = false;

  constructor() {
    effect(() => {
      const gifts = this.donations.held()?.items.length ?? 0;
      if (this.ready() && gifts > 0 && !this.offeredOnStart) {
        this.offeredOnStart = true;
        untracked(() => this.check());
      }
    });
    const visibilityChanged = () => this.cameBack();
    this.document.addEventListener('visibilitychange', visibilityChanged);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('visibilitychange', visibilityChanged),
    );
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
        this.hide();
        this.show('refused');
        return;
      }
      this.push.requestSubscription(this.publicKey).then(
        (device) => this.register(device.endpoint, device.p256dh, device.auth),
        () => {
          this.hide();
          this.show('refused');
        },
      );
    });
  }

  protected putOff(): void {
    this.hide();
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

  private ready(): boolean {
    return (
      this.jar.installed &&
      this.auth.donor() !== null &&
      this.auth.session() !== 'PUBLIC' &&
      this.navigated() &&
      !this.connectivity.offline()
    );
  }

  private cameBack(): void {
    const handedOffAt = this.handOffs.handedOffAt();
    if (this.document.visibilityState !== 'visible' || handedOffAt === null) {
      return;
    }
    this.handOffs.clear();
    if (Date.now() - handedOffAt <= HAND_OFF_COUNTS_MS && this.ready()) {
      this.check();
    }
  }

  private check(): void {
    if (
      this.checking ||
      this.step() !== null ||
      this.router.url.startsWith(ADMINISTRATION) ||
      this.hidden() ||
      pushAvailability(this.window, this.push) !== 'available'
    ) {
      return;
    }
    this.checking = true;
    this.api
      .view()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.checking = false;
          if (view.deviceSession === true && view.device === null) {
            this.publicKey = view.publicKey;
            this.show('offer');
          }
        },
        error: () => {
          this.checking = false;
        },
      });
  }

  private register(endpoint: string, p256dh: string, auth: string): void {
    this.api
      .subscribe({ endpoint, keys: { p256dh, auth } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.sendTest(),
        error: (failure: unknown) => {
          void this.holders
            .administrationAlertsHere()
            .then((held) => (held ? undefined : this.push.unsubscribe()));
          this.failure.set(
            problemTypeEndsWith(failure, SUBSCRIPTION_LIMIT)
              ? $localize`:@@donor.notifications.offer.limit:Upozornění můžete mít zapnutá nejvýš na 10 zařízeních. V Údajích a zabezpečení odhlaste zařízení, které už nepoužíváte, a zkuste to znovu.`
              : describeProblem(
                  failure,
                  $localize`:@@donor.notifications.offer.failed:Upozornění se nepodařilo zapnout. Zkuste to prosím znovu.`,
                ),
          );
          this.show('failed');
        },
      });
  }

  private sendTest(): void {
    this.api
      .test()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.testSent.set(result.delivered > 0);
          this.show('on');
        },
        error: () => {
          this.testSent.set(false);
          this.show('on');
        },
      });
  }

  private show(step: OfferStep): void {
    this.step.set(step);
    afterNextRender(() => this.title()?.nativeElement.focus(), { injector: this.injector });
  }

  private hidden(): boolean {
    try {
      return (
        Number(this.window?.localStorage.getItem(NOTIFICATIONS_OFFER_HIDDEN_KEY) ?? 0) > Date.now()
      );
    } catch {
      return true;
    }
  }

  private hide(): void {
    try {
      this.window?.localStorage.setItem(
        NOTIFICATIONS_OFFER_HIDDEN_KEY,
        String(Date.now() + NOTIFICATIONS_OFFER_HIDDEN_DAYS * DAY_MS),
      );
    } catch {
      return;
    }
  }
}
