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
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { pluralCategory } from '../../../core/i18n/plural-category';
import { AppBadge } from '../../../core/push/app-badge';
import { PushAvailability, pushAvailability } from '../../../core/push/push-availability';
import { SERVICE_WORKER_PUSH } from '../../../core/push/service-worker-push';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import {
  AdminApi,
  AdminPushResponse,
  PushAlertArea,
  PushAlertSwitches,
  PushService,
  PushSubscriptionResponse,
  PushTestResponse,
} from '../admin-api';

type LoadState = 'loading' | 'ready' | 'error' | 'unavailable';

interface AreaRow {
  readonly area: PushAlertArea;
  readonly label: string;
  readonly route: string;
  readonly brokenSince: string | null;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const PUSH_UNAVAILABLE = 'operations/push-unavailable';

export const ALERT_AREAS: readonly PushAlertArea[] = ['bankImport', 'backups', 'mail'];

const AREA_LABELS: Record<PushAlertArea, string> = {
  bankImport: $localize`:@@admin.alerts.area.bankImport:Import plateb z banky`,
  backups: $localize`:@@admin.alerts.area.backups:Zálohy`,
  mail: $localize`:@@admin.alerts.area.mail:Odesílání e-mailů`,
};

const AREA_ROUTES: Record<PushAlertArea, string> = {
  bankImport: '/sprava',
  backups: '/sprava/zalohy',
  mail: '/sprava/nastaveni',
};

const SERVICE_NAMES: Record<PushService, string> = {
  google: 'Google',
  apple: 'Apple',
  mozilla: 'Mozilla',
  microsoft: 'Microsoft',
};

@Component({
  selector: 'app-admin-alerts',
  imports: [LiveNotice, RouterLink],
  templateUrl: './admin-alerts.html',
  styleUrl: './admin-alerts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAlerts {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly badge = inject(AppBadge);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly areas = ALERT_AREAS;
  protected readonly areaLabels = AREA_LABELS;
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<AdminPushResponse | null>(null);
  protected readonly availability = signal<PushAvailability>(this.availabilityNow());
  protected readonly subscribing = signal(false);
  protected readonly testing = signal(false);
  protected readonly turningOff = signal(false);
  protected readonly savingAlerts = signal<string | null>(null);
  protected readonly removing = signal<string | null>(null);
  protected readonly deviceNotice = signal<Notice | null>(null);
  protected readonly othersNotice = signal<Notice | null>(null);

  protected readonly rows = computed<AreaRow[]>(() => {
    const open = this.view()?.openAlerts ?? [];
    return ALERT_AREAS.map((area) => {
      const alert = open.find((item) => item.area === area);
      return {
        area,
        label: AREA_LABELS[area],
        route: AREA_ROUTES[area],
        brokenSince: alert ? formatBankTime(alert.since) : null,
      };
    });
  });
  protected readonly current = computed(
    () => this.view()?.subscriptions.find((item) => item.current) ?? null,
  );
  protected readonly others = computed(
    () => this.view()?.subscriptions.filter((item) => !item.current) ?? [],
  );

  constructor() {
    this.load();
    const changes = this.push.controllerChanges.subscribe(() =>
      this.availability.set(this.availabilityNow()),
    );
    this.destroyRef.onDestroy(() => changes.unsubscribe());
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.fetch();
  }

  protected serviceName(item: PushSubscriptionResponse): string {
    return SERVICE_NAMES[item.service] ?? item.service;
  }

  protected since(item: PushSubscriptionResponse): string {
    return formatDonationDate(item.createdAt);
  }

  protected removeLabel(item: PushSubscriptionResponse): string {
    return $localize`:@@admin.alerts.others.removeLabel:Odebrat zařízení ${this.serviceName(item)}:service:, zapnuto ${this.since(item)}:since:`;
  }

  protected lastDelivery(item: PushSubscriptionResponse): string | null {
    return item.lastDeliveredAt ? formatBankTime(item.lastDeliveredAt) : null;
  }

  protected turnOn(): void {
    const view = this.view();
    if (view === null || this.subscribing()) {
      return;
    }
    this.subscribing.set(true);
    this.deviceNotice.set(null);
    const requested = this.push.requestSubscription(view.publicKey);
    requested.then(
      (device) =>
        this.api
          .subscribePush({
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
          })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (subscription) => {
              this.subscribing.set(false);
              this.replaceSubscriptions((items) => [
                ...items.filter((item) => item.id !== subscription.id && !item.current),
                { ...subscription, current: true },
              ]);
              this.deviceNotice.set({
                kind: 'status',
                text: $localize`:@@admin.alerts.device.turnedOn:Upozornění jsme na tomto zařízení zapnuli. Zkušebním upozorněním si můžete ověřit, že dorazí.`,
              });
            },
            error: (failure: unknown) => {
              this.subscribing.set(false);
              void this.push.unsubscribe();
              this.deviceNotice.set({
                kind: 'alert',
                text: describeProblem(
                  failure,
                  $localize`:@@admin.alerts.device.turnOnFailed:Upozornění se nepodařilo zapnout. Zkuste to prosím znovu.`,
                ),
              });
            },
          }),
      () => {
        this.subscribing.set(false);
        this.availability.set(this.availabilityNow());
        this.deviceNotice.set({
          kind: 'alert',
          text: $localize`:@@admin.alerts.device.browserRefused:Prohlížeč upozornění nezapnul. Pokud jste se na povolení upozornění nedostali nebo jste ho odmítli, povolte je v nastavení prohlížeče pro tento web a zkuste to znovu.`,
        });
      },
    );
  }

  protected changeAlert(item: PushSubscriptionResponse, area: PushAlertArea, on: boolean): void {
    if (this.savingAlerts() !== null) {
      return;
    }
    const notice = item.current ? this.deviceNotice : this.othersNotice;
    const alerts: PushAlertSwitches = { ...item.alerts, [area]: on };
    this.savingAlerts.set(item.id);
    notice.set(null);
    this.replaceOne({ ...item, alerts });
    this.api
      .changePushAlerts(item.id, alerts)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingAlerts.set(null);
          this.replaceOne({ ...saved, current: item.current });
          notice.set({
            kind: 'status',
            text: $localize`:@@admin.alerts.switches.saved:Uloženo: ${AREA_LABELS[area]}:area: – ${on ? ON_TEXT : OFF_TEXT}:state:.`,
          });
        },
        error: (failure: unknown) => {
          this.savingAlerts.set(null);
          this.replaceOne(item);
          notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.alerts.switches.failed:Změnu se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected sendTest(): void {
    if (this.testing()) {
      return;
    }
    this.testing.set(true);
    this.deviceNotice.set(null);
    this.api
      .testPush()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.testing.set(false);
          this.deviceNotice.set({ kind: 'status', text: testOutcome(result) });
          if (result.removed > 0) {
            this.fetch();
          }
        },
        error: (failure: unknown) => {
          this.testing.set(false);
          this.deviceNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.alerts.test.failed:Zkušební upozornění se nepodařilo poslat. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected turnOff(item: PushSubscriptionResponse): void {
    if (this.turningOff()) {
      return;
    }
    this.turningOff.set(true);
    this.deviceNotice.set(null);
    this.api
      .removePushSubscription(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.push.unsubscribe().then(() => {
            this.turningOff.set(false);
            this.replaceSubscriptions((items) => items.filter((other) => other.id !== item.id));
            this.deviceNotice.set({
              kind: 'status',
              text: $localize`:@@admin.alerts.device.turnedOff:Upozornění jsme na tomto zařízení vypnuli.`,
            });
          });
        },
        error: (failure: unknown) => {
          this.turningOff.set(false);
          this.deviceNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.alerts.device.turnOffFailed:Upozornění se nepodařilo vypnout. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected remove(item: PushSubscriptionResponse): void {
    if (this.removing() !== null) {
      return;
    }
    this.removing.set(item.id);
    this.othersNotice.set(null);
    this.api
      .removePushSubscription(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removing.set(null);
          this.replaceSubscriptions((items) => items.filter((other) => other.id !== item.id));
          this.othersNotice.set({
            kind: 'status',
            text: $localize`:@@admin.alerts.others.removed:Zařízení ${this.serviceName(item)}:service: jsme odebrali; upozornění na ně už nechodí.`,
          });
        },
        error: (failure: unknown) => {
          this.removing.set(null);
          this.othersNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.alerts.others.removeFailed:Zařízení se nepodařilo odebrat. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  private fetch(): void {
    this.api
      .push()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.view.set(view);
          this.availability.set(this.availabilityNow());
          this.badge.show(view.openAlerts.length);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sendToSignIn();
            return;
          }
          if (problemTypeEndsWith(failure, FORBIDDEN)) {
            void this.router.navigateByUrl('/darce/prehled');
            return;
          }
          this.state.set(problemTypeEndsWith(failure, PUSH_UNAVAILABLE) ? 'unavailable' : 'error');
        },
      });
  }

  private replaceOne(changed: PushSubscriptionResponse): void {
    this.replaceSubscriptions((items) =>
      items.map((item) => (item.id === changed.id ? changed : item)),
    );
  }

  private replaceSubscriptions(
    change: (items: PushSubscriptionResponse[]) => PushSubscriptionResponse[],
  ): void {
    this.view.update((view) =>
      view ? { ...view, subscriptions: change(view.subscriptions) } : view,
    );
  }

  private availabilityNow(): PushAvailability {
    return pushAvailability(this.window, this.push);
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      void this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

const ON_TEXT = $localize`:@@admin.alerts.switches.on:zapnuto`;
const OFF_TEXT = $localize`:@@admin.alerts.switches.off:vypnuto`;

function testOutcome({ delivered, failed, removed }: PushTestResponse): string {
  const parts = [
    $localize`:@@admin.alerts.test.delivered:Zkušební upozornění jsme předali ke doručení na ${delivered}:count: zařízení.`,
  ];
  if (failed > 0) {
    parts.push(
      $localize`:@@admin.alerts.test.failedDevices:Na ${failed}:count: zařízení se ho předat nepodařilo.`,
    );
  }
  if (removed > 0) {
    parts.push(removedText(removed));
  }
  return parts.join(' ');
}

function removedText(removed: number): string {
  switch (pluralCategory(removed)) {
    case 'one':
      return $localize`:@@admin.alerts.test.removed.one:${removed}:count: zařízení už upozornění nepřijímalo, a tak jsme ho odebrali.`;
    case 'few':
      return $localize`:@@admin.alerts.test.removed.few:${removed}:count: zařízení už upozornění nepřijímala, a tak jsme je odebrali.`;
    default:
      return $localize`:@@admin.alerts.test.removed.other:${removed}:count: zařízení už upozornění nepřijímalo, a tak jsme je odebrali.`;
  }
}
