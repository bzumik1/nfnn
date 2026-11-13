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
import { ListChanges } from '../../../core/kept/list-changes';
import { OpenAlerts } from '../../../core/push/open-alerts';
import { PushAvailability, pushAvailability } from '../../../core/push/push-availability';
import {
  BrowserPushSubscriptionState,
  SERVICE_WORKER_PUSH,
} from '../../../core/push/service-worker-push';
import { Dialog } from '../../../shared/ui/dialog/dialog';
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
import { KeptAdministrationAnswers } from '../kept-administration-answers';
import { DeviceAlertMarks } from './device-alert-marks';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';

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
const SUBSCRIPTION_LIMIT = 'operations/push-subscription-limit';

type FocusTarget = 'alerts-device-title' | 'alerts-others-title' | 'alerts-test-title';

export const ALERT_AREAS: readonly PushAlertArea[] = ['bankImport', 'backups', 'mail'];

const AREA_LABELS: Record<PushAlertArea, string> = {
  bankImport: $localize`:@@admin.alerts.area.bankImport:Import plateb z banky`,
  backups: $localize`:@@admin.alerts.area.backups:Zálohy`,
  mail: $localize`:@@admin.alerts.area.mail:Odesílání e-mailů`,
};

const AREA_DESCRIPTIONS: Record<PushAlertArea, string> = {
  bankImport: $localize`:@@admin.alerts.area.bankImport.description:Když se platby z banky přestanou stahovat a když se zase stahují.`,
  backups: $localize`:@@admin.alerts.area.backups.description:Když záloha selže nebo chybí a když je zase v pořádku.`,
  mail: $localize`:@@admin.alerts.area.mail.description:Když server e-mail neodešle a když zase odesílá.`,
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
  imports: [Dialog, LiveNotice, NeedsConnection, RouterLink],
  templateUrl: './admin-alerts.html',
  styleUrl: './admin-alerts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAlerts {
  private readonly api = inject(AdminApi);
  private readonly kept = inject(KeptAdministrationAnswers);
  private readonly changes = new ListChanges(() => this.fetch(true));
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly push = inject(SERVICE_WORKER_PUSH);
  private readonly openAlerts = inject(OpenAlerts);
  private readonly marks = inject(DeviceAlertMarks);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly areas = ALERT_AREAS;
  protected readonly areaLabels = AREA_LABELS;
  protected readonly areaDescriptions = AREA_DESCRIPTIONS;
  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly view = signal<AdminPushResponse | null>(null);
  protected readonly availability = signal<PushAvailability>(this.availabilityNow());
  protected readonly subscribing = signal(false);
  protected readonly testing = signal(false);
  protected readonly turningOff = signal(false);
  protected readonly savingAlerts = signal<string | null>(null);
  protected readonly removing = signal<string | null>(null);
  protected readonly deviceNotice = signal<Notice | null>(null);
  protected readonly othersNotice = signal<Notice | null>(null);
  protected readonly sheetNotice = signal<Notice | null>(null);
  private readonly openedId = signal<string | null>(null);
  protected readonly testNotice = signal<Notice | null>(null);
  protected readonly browserState = signal<BrowserPushSubscriptionState>('unknown');

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
  protected readonly openedDevice = computed(
    () => this.others().find((item) => item.id === this.openedId()) ?? null,
  );
  protected readonly deviceSession = computed(() => this.view()?.deviceSession === true);
  protected readonly hasDevices = computed(() => (this.view()?.subscriptions.length ?? 0) > 0);
  protected readonly currentLost = computed(
    () =>
      this.current() !== null &&
      (this.availability() === 'denied' || this.browserState() === 'not-subscribed'),
  );

  constructor() {
    const shown = this.kept.kept('push');
    if (shown !== null) {
      this.showView(shown);
      this.fetch(true);
    } else {
      this.load();
    }
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
    return this.removing() === item.id
      ? $localize`:@@admin.alerts.others.removingLabel:Odebíráme zařízení ${this.serviceName(item)}:service:, zapnuto ${this.since(item)}:since:`
      : $localize`:@@admin.alerts.others.removeLabel:Odebrat zařízení ${this.serviceName(item)}:service:, zapnuto ${this.since(item)}:since:`;
  }

  protected switchesOn(item: PushSubscriptionResponse): number {
    return ALERT_AREAS.filter((area) => item.alerts[area]).length;
  }

  protected openDevice(item: PushSubscriptionResponse): void {
    this.sheetNotice.set(null);
    this.openedId.set(item.id);
  }

  protected closeDevice(): void {
    this.openedId.set(null);
  }

  protected lastDelivery(item: PushSubscriptionResponse): string | null {
    return item.lastDeliveredAt ? formatBankTime(item.lastDeliveredAt) : null;
  }

  protected turnOn(): void {
    const view = this.view();
    if (view === null || this.subscribing()) {
      return;
    }
    const permission = this.push.requestPermission();
    this.subscribing.set(true);
    this.deviceNotice.set(null);
    void permission.then((answer) => {
      if (answer !== 'granted') {
        this.browserRefused();
        return;
      }
      this.push.requestSubscription(view.publicKey).then(
        (device) => this.registerDevice(device.endpoint, device.p256dh, device.auth),
        () => this.browserRefused(),
      );
    });
  }

  protected changeAlert(
    item: PushSubscriptionResponse,
    area: PushAlertArea,
    input: HTMLInputElement,
  ): void {
    if (this.savingAlerts() !== null) {
      input.checked = item.alerts[area];
      return;
    }
    const on = input.checked;
    const notice = item.current ? this.deviceNotice : this.sheetNotice;
    const device = item.current
      ? THIS_DEVICE_TEXT
      : `${this.serviceName(item)} (${this.since(item)})`;
    const alerts: PushAlertSwitches = { ...item.alerts, [area]: on };
    this.savingAlerts.set(item.id);
    notice.set(null);
    this.replaceOne({ ...item, alerts });
    this.changes.changing();
    this.api
      .changePushAlerts(item.id, alerts)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingAlerts.set(null);
          this.replaceOne({ ...saved, current: item.current });
          this.changedHere();
          notice.set({
            kind: 'status',
            text: $localize`:@@admin.alerts.switches.saved:Uloženo pro ${device}:device:: ${AREA_LABELS[area]}:area: – ${on ? ON_TEXT : OFF_TEXT}:state:.`,
          });
        },
        error: (failure: unknown) => {
          this.savingAlerts.set(null);
          this.replaceOne(item);
          this.changes.changed();
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
    this.testNotice.set(null);
    this.api
      .testPush()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.testing.set(false);
          this.testNotice.set({ kind: 'status', text: testOutcome(result) });
          if (result.removed > 0) {
            this.fetch();
          }
        },
        error: (failure: unknown) => {
          this.testing.set(false);
          this.testNotice.set({
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
    this.changes.changing();
    this.api
      .removePushSubscription(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.marks.clearOwner();
          void this.push.unsubscribe().then(() => {
            this.turningOff.set(false);
            this.browserState.set('unknown');
            this.replaceSubscriptions((items) => items.filter((other) => other.id !== item.id));
            this.changedHere();
            this.deviceNotice.set({
              kind: 'status',
              text: $localize`:@@admin.alerts.device.turnedOff:Upozornění jsme na tomto zařízení vypnuli.`,
            });
            this.focusAfterRender('alerts-device-title');
          });
        },
        error: (failure: unknown) => {
          this.turningOff.set(false);
          this.changes.changed();
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
    this.sheetNotice.set(null);
    this.changes.changing();
    this.api
      .removePushSubscription(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removing.set(null);
          this.openedId.set(null);
          this.replaceSubscriptions((items) => items.filter((other) => other.id !== item.id));
          this.changedHere();
          this.othersNotice.set({
            kind: 'status',
            text: $localize`:@@admin.alerts.others.removed:Zařízení ${this.serviceName(item)}:service: jsme odebrali; upozornění na ně už nechodí.`,
          });
          this.focusAfterRender('alerts-others-title');
        },
        error: (failure: unknown) => {
          this.removing.set(null);
          this.changes.changed();
          this.sheetNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.alerts.others.removeFailed:Zařízení se nepodařilo odebrat. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  private fetch(quietly = false): void {
    this.changes
      .track(this.api.push())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.showView(view);
          this.openAlerts.accept(view.openAlerts ?? []);
          this.kept.keep('push', view);
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
          if (quietly && this.state() === 'ready') {
            return;
          }
          this.loadError.set(
            describeProblem(
              failure,
              $localize`:@@admin.alerts.error.text:Upozornění se nepodařilo načíst.`,
            ),
          );
          this.state.set(problemTypeEndsWith(failure, PUSH_UNAVAILABLE) ? 'unavailable' : 'error');
        },
      });
  }

  private showView(view: AdminPushResponse): void {
    this.view.set(view);
    this.availability.set(this.availabilityNow());
    this.state.set('ready');
    this.checkBrowserSubscription();
  }

  private changedHere(): void {
    this.changes.changed(false);
    this.changes.answeredByChange();
    const view = this.view();
    if (view !== null) {
      this.kept.keep('push', view);
    }
  }

  private registerDevice(endpoint: string, p256dh: string, auth: string): void {
    this.changes.changing();
    this.api
      .subscribePush({ endpoint, keys: { p256dh, auth } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subscription) => {
          const donorId = this.auth.donor()?.id;
          if (donorId) {
            void this.marks.markOwner(donorId);
          }
          this.subscribing.set(false);
          this.browserState.set('subscribed');
          this.replaceSubscriptions((items) => [
            ...items.filter((item) => item.id !== subscription.id && !item.current),
            { ...subscription, current: true },
          ]);
          this.changedHere();
          this.deviceNotice.set({
            kind: 'status',
            text: $localize`:@@admin.alerts.device.turnedOn:Upozornění jsme na tomto zařízení zapnuli. Zkušebním upozorněním si můžete ověřit, že dorazí.`,
          });
          this.focusAfterRender('alerts-device-title');
          this.fetch();
        },
        error: (failure: unknown) => {
          this.subscribing.set(false);
          this.changes.changed();
          void this.push.unsubscribe();
          this.deviceNotice.set({
            kind: 'alert',
            text: problemTypeEndsWith(failure, SUBSCRIPTION_LIMIT)
              ? $localize`:@@admin.alerts.device.limit:Upozornění můžete mít zapnutá nejvýš na 10 zařízeních. Odeberte níže v části Další zařízení to, které už nepoužíváte, a zkuste to znovu.`
              : describeProblem(
                  failure,
                  $localize`:@@admin.alerts.device.turnOnFailed:Upozornění se nepodařilo zapnout. Zkuste to prosím znovu.`,
                ),
          });
        },
      });
  }

  private browserRefused(): void {
    this.subscribing.set(false);
    this.availability.set(this.availabilityNow());
    this.deviceNotice.set({
      kind: 'alert',
      text: $localize`:@@admin.alerts.device.browserRefused:Prohlížeč upozornění nezapnul. Pokud jste se na povolení upozornění nedostali nebo jste ho odmítli, povolte je v nastavení prohlížeče pro tento web a zkuste to znovu.`,
    });
  }

  private checkBrowserSubscription(): void {
    if (this.current() === null || !this.push.isEnabled) {
      this.browserState.set('unknown');
      return;
    }
    void this.push.browserSubscription().then((state) => {
      if (!this.destroyRef.destroyed) {
        this.browserState.set(state);
      }
    });
  }

  private focusAfterRender(target: FocusTarget): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`#${target}`)?.focus(),
      { injector: this.injector },
    );
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

const THIS_DEVICE_TEXT = $localize`:@@admin.alerts.switches.thisDevice:toto zařízení`;
const ON_TEXT = $localize`:@@admin.alerts.switches.on:zapnuto`;
const OFF_TEXT = $localize`:@@admin.alerts.switches.off:vypnuto`;

function testOutcome({ delivered, failed, removed }: PushTestResponse): string {
  const parts = [
    delivered > 0
      ? $localize`:@@admin.alerts.test.deliveredShort:Zkušební upozornění jsme předali k doručení na ${delivered}:count: zařízení.`
      : $localize`:@@admin.alerts.test.noneDelivered:Zkušební upozornění se nepodařilo předat na žádné zařízení. Zapněte upozornění znovu na zařízení, kde je chcete dostávat.`,
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
