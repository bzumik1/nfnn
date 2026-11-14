/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthStore } from '../../../../core/auth/auth-store';
import { PushAvailability, pushAvailability } from '../../../../core/push/push-availability';
import {
  BrowserPushSubscriptionState,
  SERVICE_WORKER_PUSH,
} from '../../../../core/push/service-worker-push';
import { LiveNotice, Notice } from '../../../../shared/ui/live-notice/live-notice';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formatBankTime } from '../../../donations/donation-date';
import { BrowserPushHolders } from '../../../operations/browser-push-holders';
import { DonorNotifiedDevices } from '../../../operations/donor-notified-devices';
import {
  DonorNotificationSwitches,
  DonorPushApi,
  DonorPushDevice,
  DonorPushResponse,
  DonorPushTestResponse,
} from '../../../operations/donor-push-api';

type LoadState = 'loading' | 'ready' | 'error' | 'unavailable';
type Kind = keyof DonorNotificationSwitches;
type Offer = 'device-session' | 'public' | 'browser' | PushAvailability;

const UNAUTHENTICATED = 'auth/unauthenticated';
const PUSH_UNAVAILABLE = 'operations/push-unavailable';
const SUBSCRIPTION_LIMIT = 'operations/push-subscription-limit';
const SUBSCRIPTION_NOT_FOUND = 'operations/push-subscription-not-found';

const KIND_LABELS: Record<Kind, string> = {
  gifts: $localize`:@@donor.notifications.kind.gifts:Dar dorazil`,
  yearlyReceipts: $localize`:@@donor.notifications.kind.yearlyReceipts:Roční potvrzení`,
};

const KIND_DESCRIPTIONS: Record<Kind, string> = {
  gifts: $localize`:@@donor.notifications.kind.gifts.description:Když nám z banky dorazí váš nový dar, třeba každý měsíc z trvalého příkazu.`,
  yearlyReceipts: $localize`:@@donor.notifications.kind.yearlyReceipts.description:Jednou za rok v lednu, když si můžete stáhnout potvrzení za minulý rok.`,
};

@Component({
  selector: 'app-notifications-card',
  imports: [LiveNotice, NeedsConnection],
  templateUrl: './notifications-card.html',
  styleUrl: './notifications-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsCard {
  private readonly api = inject(DonorPushApi);
  private readonly auth = inject(AuthStore);
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly holders = inject(BrowserPushHolders);
  private readonly notified = inject(DonorNotifiedDevices);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  readonly sessionEnded = output<void>();

  protected readonly kinds: readonly Kind[] = ['gifts', 'yearlyReceipts'];
  protected readonly kindLabels = KIND_LABELS;
  protected readonly kindDescriptions = KIND_DESCRIPTIONS;
  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly view = signal<DonorPushResponse | null>(null);
  protected readonly availability = signal<PushAvailability>(
    pushAvailability(this.window, this.push),
  );
  protected readonly browserState = signal<BrowserPushSubscriptionState>('unknown');
  protected readonly turningOn = signal(false);
  protected readonly turningOff = signal(false);
  protected readonly saving = signal(false);
  protected readonly busy = computed(() => this.turningOn() || this.turningOff() || this.saving());
  protected readonly notice = signal<Notice | null>(null);

  protected readonly device = computed(() => this.view()?.device ?? null);
  protected readonly lost = computed(
    () =>
      this.device() !== null &&
      this.availability() !== 'denied' &&
      this.browserState() === 'not-subscribed',
  );
  protected readonly offer = computed<Offer>(() => {
    const session = this.auth.session();
    if (session === 'PUBLIC') {
      return 'public';
    }
    if (session === 'BROWSER') {
      return 'browser';
    }
    if (this.view()?.deviceSession === false) {
      return 'device-session';
    }
    return this.availability();
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.fetch(false);
  }

  protected lastDelivery(device: DonorPushDevice): string | null {
    return device.lastDeliveredAt ? formatBankTime(device.lastDeliveredAt) : null;
  }

  protected turnOn(): void {
    const view = this.view();
    if (view === null || this.busy()) {
      return;
    }
    const permission = this.push.requestPermission();
    this.turningOn.set(true);
    this.notice.set(null);
    void permission.then((answer) => {
      if (answer !== 'granted') {
        this.browserRefused();
        return;
      }
      this.push.requestSubscription(view.publicKey).then(
        (device) => this.register(device.endpoint, device.p256dh, device.auth),
        () => this.browserRefused(),
      );
    });
  }

  protected change(kind: Kind, input: HTMLInputElement): void {
    const device = this.device();
    if (device === null || this.busy()) {
      if (device !== null) {
        input.checked = device.notifications[kind];
      }
      return;
    }
    const on = input.checked;
    this.saving.set(true);
    this.notice.set(null);
    this.api
      .changeNotifications({ ...device.notifications, [kind]: on })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.replaceDevice(saved);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@donor.notifications.saved:Uloženo: ${KIND_LABELS[kind]}:kind: – ${on ? ON_TEXT : OFF_TEXT}:state:.`,
          });
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          input.checked = device.notifications[kind];
          if (problemTypeEndsWith(failure, SUBSCRIPTION_NOT_FOUND)) {
            this.fetch(true);
          }
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@donor.notifications.saveFailed:Změnu se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected turnOff(): void {
    if (this.busy()) {
      return;
    }
    this.turningOff.set(true);
    this.notice.set(null);
    this.api
      .remove()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.releaseBrowser().then(() => {
            this.turningOff.set(false);
            this.view.update((view) => (view ? { ...view, device: null } : view));
            this.notice.set({
              kind: 'status',
              text: $localize`:@@donor.notifications.turnedOff:Upozornění jsme na tomto zařízení vypnuli.`,
            });
            this.focusHeading();
            this.fetch(true);
          });
        },
        error: (failure: unknown) => {
          this.turningOff.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@donor.notifications.turnOffFailed:Upozornění se nepodařilo vypnout. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  private fetch(quietly: boolean): void {
    this.api
      .view()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => this.show(view),
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sessionEnded.emit();
            return;
          }
          if (quietly && this.state() === 'ready') {
            return;
          }
          this.loadError.set(
            describeProblem(
              failure,
              $localize`:@@donor.notifications.loadFailed:Upozornění se nepodařilo načíst.`,
            ),
          );
          this.state.set(problemTypeEndsWith(failure, PUSH_UNAVAILABLE) ? 'unavailable' : 'error');
        },
      });
  }

  private register(endpoint: string, p256dh: string, auth: string): void {
    this.api
      .subscribe({ endpoint, keys: { p256dh, auth } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (device) => {
          this.turningOn.set(false);
          this.browserState.set('subscribed');
          this.replaceDevice(device);
          this.notice.set({ kind: 'status', text: TURNED_ON });
          this.focusHeading();
          this.sendTest();
        },
        error: (failure: unknown) => {
          this.turningOn.set(false);
          void this.releaseBrowser();
          this.notice.set({
            kind: 'alert',
            text: problemTypeEndsWith(failure, SUBSCRIPTION_LIMIT)
              ? $localize`:@@donor.notifications.limit:Upozornění můžete mít zapnutá nejvýš na 10 zařízeních. Na zařízení, které už nepoužíváte, je vypněte nebo ho v kartě Přihlášená zařízení odhlaste.`
              : describeProblem(
                  failure,
                  $localize`:@@donor.notifications.turnOnFailed:Upozornění se nepodařilo zapnout. Zkuste to prosím znovu.`,
                ),
          });
        },
      });
  }

  private sendTest(): void {
    this.api
      .test()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.notice.set({ kind: 'status', text: `${TURNED_ON} ${testOutcome(result)}` });
          this.fetch(true);
        },
        error: (failure: unknown) => {
          this.notice.set({
            kind: 'status',
            text: `${TURNED_ON} ${describeProblem(
              failure,
              $localize`:@@donor.notifications.testFailed:Zkušební upozornění se teď nepodařilo poslat.`,
            )}`,
          });
          this.fetch(true);
        },
      });
  }

  private async releaseBrowser(): Promise<void> {
    if (!(await this.holders.administrationAlertsHere())) {
      await this.push.unsubscribe();
    }
  }

  private browserRefused(): void {
    this.turningOn.set(false);
    this.availability.set(pushAvailability(this.window, this.push));
    this.notice.set({
      kind: 'alert',
      text: $localize`:@@donor.notifications.browserRefused:Prohlížeč upozornění nezapnul. Pokud jste povolení odmítli, povolte je v nastavení prohlížeče pro tento web a zkuste to znovu.`,
    });
  }

  private show(view: DonorPushResponse): void {
    this.view.set(view);
    this.notified.accept(view.devices);
    this.availability.set(pushAvailability(this.window, this.push));
    this.state.set('ready');
    this.checkBrowserSubscription();
  }

  private checkBrowserSubscription(): void {
    if (this.device() === null || !this.push.isEnabled) {
      this.browserState.set('unknown');
      return;
    }
    void this.push.browserSubscription().then((state) => {
      if (!this.destroyRef.destroyed) {
        this.browserState.set(state);
      }
    });
  }

  private replaceDevice(device: DonorPushDevice): void {
    this.view.update((view) => (view ? { ...view, device } : view));
  }

  private focusHeading(): void {
    afterNextRender(() => this.heading().nativeElement.focus(), { injector: this.injector });
  }
}

const TURNED_ON = $localize`:@@donor.notifications.turnedOn:Upozornění jsme na tomto zařízení zapnuli.`;
const ON_TEXT = $localize`:@@donor.notifications.on:zapnuto`;
const OFF_TEXT = $localize`:@@donor.notifications.off:vypnuto`;

function testOutcome({ delivered }: DonorPushTestResponse): string {
  return delivered > 0
    ? $localize`:@@donor.notifications.testDelivered:Zkušební upozornění jsme předali k doručení.`
    : $localize`:@@donor.notifications.testNotDelivered:Zkušební upozornění se na toto zařízení nepodařilo předat. Vypněte upozornění a zapněte je znovu.`;
}
