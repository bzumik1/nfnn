import { OpenAlerts } from '../../../core/push/open-alerts';
import type { Mock } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { AppBadge } from '../../../core/push/app-badge';
import {
  BrowserPushSubscriptionState,
  DevicePushSubscription,
  NO_PUSH,
  NotificationPermissionAnswer,
  SERVICE_WORKER_PUSH,
  ServiceWorkerPush,
} from '../../../core/push/service-worker-push';
import { AdminPushResponse } from '../admin-api';
import { adminPush, PUSH_PUBLIC_KEY, pushSubscription } from '../testing/admin-fixtures';
import { PageReload } from '../../../core/reload/page-reload';
import { ReloadPlace } from '../../../core/reload/reload-place';
import { AdminAlerts } from './admin-alerts';
import { DeviceAlertMarks } from './device-alert-marks';
import { accessibleText } from '../../../shared/ui/busy-label/testing/accessible-text';
import { labelFaces } from '../../../shared/ui/busy-label/testing/label-faces';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';
import {
  alertsHoldingAButton,
  loadFailureAlerts,
  pressLoadFailureRetry,
} from '../../../shared/ui/load-failure/testing/load-failure-retry';

const PUSH_URL = '/api/admin/operations/push';
const DEVICE: DevicePushSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/this-device',
  p256dh: 'BKeyOfThisBrowser',
  auth: 'authOfThisBrowser',
};

function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

type FakePush = ServiceWorkerPush & {
  requestPermission: Mock<() => Promise<NotificationPermissionAnswer>>;
  requestSubscription: Mock<(publicKey: string) => Promise<DevicePushSubscription>>;
  browserSubscription: Mock<() => Promise<BrowserPushSubscriptionState>>;
  unsubscribe: Mock<() => Promise<void>>;
};

function fakePush(controllerChanges = new Subject<void>()): FakePush {
  return {
    ...NO_PUSH,
    isEnabled: true,
    controllerChanges,
    requestPermission: vi.fn<() => Promise<NotificationPermissionAnswer>>(() =>
      Promise.resolve('granted'),
    ),
    browserSubscription: vi.fn<() => Promise<BrowserPushSubscriptionState>>(() =>
      Promise.resolve('subscribed'),
    ),
    requestSubscription: vi.fn<(publicKey: string) => Promise<DevicePushSubscription>>(() =>
      Promise.resolve(DEVICE),
    ),
    unsubscribe: vi.fn(() => Promise.resolve()),
  };
}

function withPushApi(permission = 'default'): void {
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });
}

describe('Given an administrator on the alerts page', () => {
  let fixture: ComponentFixture<AdminAlerts>;
  let http: HttpTestingController;
  let push: FakePush;
  let badge: { show: Mock<(count: number) => void> };
  let reloadFocusing: Mock<(target: string) => boolean>;
  let focusAfterReload: string | null;

  async function open(answer: object = adminPush()): Promise<void> {
    fixture = TestBed.createComponent(AdminAlerts);
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: PUSH_URL }).flush(answer);
    await settle();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(selector: string): string {
    return (withOrdinarySpaces(fixture.nativeElement.querySelector(selector)?.textContent) ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function section(title: string): HTMLElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('section') as NodeListOf<HTMLElement>,
    ).find(
      (candidate) =>
        withOrdinarySpaces(candidate.querySelector('h2')?.textContent)?.trim() === title,
    );
    if (found === undefined) {
      throw new Error(`No section titled ${title}`);
    }
    return found;
  }

  function sectionText(title: string): string {
    return (withOrdinarySpaces(section(title).textContent) ?? '').replace(/\s+/g, ' ').trim();
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find(
      (candidate) =>
        accessibleText(candidate) === name || candidate.getAttribute('aria-label') === name,
    );
    if (found === undefined) {
      throw new Error(`No button named ${name}`);
    }
    return found;
  }

  function switches(within: HTMLElement): HTMLInputElement[] {
    return Array.from(within.querySelectorAll('input[type="checkbox"][role="switch"]'));
  }

  function described(element: HTMLElement): string {
    return (element.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => withOrdinarySpaces(document.getElementById(id)?.textContent) ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sheet(): HTMLElement {
    const found = fixture.nativeElement.querySelector('dialog') as HTMLElement | null;
    if (found === null) {
      throw new Error('No sheet is open');
    }
    return found;
  }

  async function openOtherDevice(name: string): Promise<void> {
    const row = Array.from(
      section('Další zařízení').querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find(
      (candidate) =>
        withOrdinarySpaces(candidate.querySelector('.ui-list__title')?.textContent)?.trim() ===
        name,
    );
    if (row === undefined) {
      throw new Error(`No device row named ${name}`);
    }
    row.click();
    await settle();
  }

  function status(): string {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="status"]:not(:empty)'))
      .map((element) =>
        (withOrdinarySpaces((element as HTMLElement).textContent) ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((line) => line !== '')
      .join(' | ');
  }

  function alerts(): string {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="alert"]'))
      .map((element) =>
        (withOrdinarySpaces((element as HTMLElement).textContent) ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((line) => line !== '')
      .join(' | ');
  }

  beforeEach(async () => {
    localStorage.clear();
    push = fakePush();
    badge = { show: vi.fn() };
    reloadFocusing = vi.fn(() => true);
    focusAfterReload = null;
    await TestBed.configureTestingModule({
      imports: [AdminAlerts],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SERVICE_WORKER_PUSH, useFactory: () => push },
        { provide: AppBadge, useFactory: () => badge },
        { provide: PageReload, useFactory: () => ({ reloadFocusing }) },
        {
          provide: ReloadPlace,
          useFactory: () => ({ takeFocus: (target: string) => target === focusAfterReload }),
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(window, 'Notification');
    http.verify();
  });

  describe('when the page opens with one open alert', () => {
    beforeEach(async () => {
      withPushApi();
      await open(adminPush({ openAlerts: [{ area: 'backups', since: '2026-11-04T05:15:00Z' }] }));
    });

    it('then it lists what is watched, each with its state and a link to its page', () => {
      const rows = Array.from(
        section('Co se hlídá').querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
      ).map((link) => [
        withOrdinarySpaces(link.querySelector('.ui-list__title')?.textContent)?.trim(),
        withOrdinarySpaces(link.querySelector('.ui-list__meta')?.textContent)?.trim(),
        link.getAttribute('href'),
      ]);

      expect(rows).toEqual([
        ['Import plateb z banky', undefined, '/sprava'],
        ['Zálohy', 'Nefunguje od 4. 11. 2026 6:15', '/sprava/zalohy'],
        ['Odesílání e-mailů', undefined, '/sprava/nastaveni'],
      ]);
    });

    it('then the badge of the app icon shows the count of open alerts', () => {
      expect(badge.show).toHaveBeenCalledWith(1);
    });

    it('then it offers to turn the alerts on and says no other device has them', () => {
      expect(button('Zapnout upozornění na tomto zařízení')).toBeTruthy();
      expect(sectionText('Další zařízení')).toContain(
        'Na jiném zařízení upozornění zapnutá nemáte.',
      );
    });

    it('then turning on is the filled main action of its card over its footer, and the empty list of other devices says so as an empty card', () => {
      const turnOn = button('Zapnout upozornění na tomto zařízení');
      expect(turnOn.classList).toContain('ui-button--primary');
      expect(turnOn.getAttribute('aria-describedby')).toBe('alerts-device-offer');
      expect(section('Toto zařízení').querySelector('.ui-card__footer')?.id).toBe(
        'alerts-device-offer',
      );
      expect(
        withOrdinarySpaces(
          section('Další zařízení').querySelector('.ui-card__empty')?.textContent,
        )?.trim(),
      ).toBe('Na jiném zařízení upozornění zapnutá nemáte.');
      expect(section('Další zařízení').querySelector('.ui-card__footer')).toBeNull();
    });

    it('then a working area reads that it has no fault, and no test alert is offered without a device', () => {
      expect(sectionText('Co se hlídá')).toContain('Bez poruchy');
      expect(fixture.nativeElement.querySelector('#alerts-test-title')).toBeNull();
    });
  });

  it('when the sign-in names no device, then the page says why alerts cannot be turned on here and never asks the browser', async () => {
    withPushApi();
    await open(adminPush({ deviceSession: false }));

    expect(sectionText('Toto zařízení')).toContain(
      'Toto přihlášení je starší, než web začal rozlišovat zařízení, a proto na něm upozornění zapnout nejde.',
    );
    expect(() => button('Zapnout upozornění na tomto zařízení')).toThrow();
    expect(push.requestPermission).not.toHaveBeenCalled();
  });

  it('when the server does not say whether the sign-in names a device, then it counts as one that does not', async () => {
    withPushApi();
    const older: Partial<AdminPushResponse> = adminPush();
    delete older.deviceSession;
    await open(older);

    expect(sectionText('Toto zařízení')).toContain(
      'Toto přihlášení je starší, než web začal rozlišovat zařízení',
    );
  });

  it('when an older server sends no open alerts, then the page treats them as none', async () => {
    withPushApi();
    const older: Partial<AdminPushResponse> = adminPush();
    delete older.openAlerts;
    await open(older);

    expect(badge.show).toHaveBeenCalledWith(0);
    expect(sectionText('Co se hlídá')).not.toContain('Nefunguje');
  });

  it('when the administrator turns the alerts on, then the browser subscribes with the server key and the device is posted', async () => {
    withPushApi();
    await open();

    button('Zapnout upozornění na tomto zařízení').click();
    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    await settle();

    expect(push.requestSubscription).toHaveBeenCalledWith(PUSH_PUBLIC_KEY);
    const turningOn = button('Zapínáme upozornění…');
    expect(turningOn.disabled).toBe(true);
    expect(labelFaces(turningOn)).toEqual([
      'Zapnout upozornění na tomto zařízení',
      'Zapínáme upozornění…',
    ]);
    const request = http.expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` });
    expect(request.request.body).toEqual({
      endpoint: DEVICE.endpoint,
      keys: { p256dh: DEVICE.p256dh, auth: DEVICE.auth },
    });
    request.flush(pushSubscription(), { status: 201, statusText: 'Created' });
    await settle();

    expect(status()).toContain('Upozornění jsme na tomto zařízení zapnuli.');
    expect(withOrdinarySpaces(document.activeElement?.textContent)?.trim()).toBe('Toto zařízení');
    await vi.waitFor(async () =>
      expect(await TestBed.inject(DeviceAlertMarks).ownedBy(sampleDonor().id)).toBe(true),
    );
    http
      .expectOne({ method: 'GET', url: PUSH_URL })
      .flush(adminPush({ subscriptions: [pushSubscription()] }));
    await settle();

    expect(switches(section('Toto zařízení')).map((box) => box.checked)).toEqual([
      true,
      true,
      true,
    ]);
    expect(button('Poslat zkušební upozornění')).toBeTruthy();
  });

  it('when the subscribe took over a device of an older session, then the list read again drops it', async () => {
    withPushApi();
    await open(
      adminPush({ subscriptions: [pushSubscription({ id: 'push-old-session', current: false })] }),
    );
    expect(sectionText('Další zařízení')).toContain('Google, zapnuto 1. 11. 2026');

    button('Zapnout upozornění na tomto zařízení').click();
    await settle();
    http
      .expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` })
      .flush(pushSubscription(), { status: 201, statusText: 'Created' });
    await settle();
    http
      .expectOne({ method: 'GET', url: PUSH_URL })
      .flush(adminPush({ subscriptions: [pushSubscription()] }));
    await settle();

    expect(sectionText('Další zařízení')).toContain('Na jiném zařízení upozornění zapnutá nemáte.');
  });

  it('when the administrator refuses the permission, then nothing is subscribed and the page says how to allow notifications', async () => {
    withPushApi();
    push.requestPermission.mockResolvedValue('denied');
    await open();

    button('Zapnout upozornění na tomto zařízení').click();
    await settle();

    expect(push.requestSubscription).not.toHaveBeenCalled();
    expect(alerts()).toContain('Prohlížeč upozornění nezapnul.');
  });

  it('when the browser fails to subscribe, then the page says how to allow notifications', async () => {
    withPushApi();
    push.requestSubscription.mockImplementation(() =>
      Promise.reject(new DOMException('denied', 'NotAllowedError')),
    );
    await open();

    button('Zapnout upozornění na tomto zařízení').click();
    await settle();

    expect(alerts()).toContain('Prohlížeč upozornění nezapnul.');
    expect(button('Zapnout upozornění na tomto zařízení').disabled).toBe(false);
  });

  it('when the administrator already has ten devices, then the page points to removing one here', async () => {
    withPushApi();
    await open();

    button('Zapnout upozornění na tomto zařízení').click();
    await settle();
    const limit = problem(
      409,
      'operations/push-subscription-limit',
      'Příliš mnoho zařízení',
      'Vypněte je nejdřív na zařízení, které už nepoužíváte.',
    );
    http
      .expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` })
      .flush(limit.body, limit.options);
    await settle();

    expect(push.unsubscribe).toHaveBeenCalled();
    expect(alerts()).toContain('Odeberte níže v části Další zařízení to, které už nepoužíváte');
  });

  it('when the server refuses the device, then the browser subscription is dropped and the refusal shown', async () => {
    withPushApi();
    await open();

    button('Zapnout upozornění na tomto zařízení').click();
    await settle();
    const refused = problem(
      403,
      'operations/push-device-required',
      'Toto přihlášení nemá zařízení',
      'Odhlaste se a přihlaste znovu.',
    );
    http
      .expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` })
      .flush(refused.body, refused.options);
    await settle();

    expect(push.unsubscribe).toHaveBeenCalled();
    expect(alerts()).toContain('Toto přihlášení nemá zařízení. Odhlaste se a přihlaste znovu.');
  });

  describe('when two other devices of one service were turned on the same day', () => {
    beforeEach(async () => {
      withPushApi();
      await open(
        adminPush({
          subscriptions: [
            pushSubscription({
              id: 'push-phone',
              service: 'apple',
              current: false,
              createdAt: '2026-10-20T08:05:00Z',
            }),
            pushSubscription({
              id: 'push-tablet',
              service: 'apple',
              current: false,
              createdAt: '2026-10-20T14:30:00Z',
            }),
            pushSubscription({
              id: 'push-laptop',
              service: 'apple',
              current: false,
              createdAt: '2026-10-22T09:00:00Z',
            }),
            pushSubscription(),
          ],
        }),
      );
    });

    it('then their rows tell them apart by the time and a device alone on its day keeps the date', () => {
      const titles = Array.from(
        section('Další zařízení').querySelectorAll('.ui-list__title') as NodeListOf<HTMLElement>,
      ).map((title) => (title.textContent ?? '').trim());

      expect(titles).toEqual([
        'Apple, zapnuto 20.\u00a010. 2026 10:05',
        'Apple, zapnuto 20.\u00a010. 2026 16:30',
        'Apple, zapnuto 22.\u00a010. 2026',
      ]);
    });
  });

  describe('when this device is subscribed and another one too', () => {
    beforeEach(async () => {
      withPushApi();
      await open(
        adminPush({
          subscriptions: [
            pushSubscription({
              id: 'push-phone',
              service: 'apple',
              current: false,
              createdAt: '2026-10-30T10:00:00Z',
              lastDeliveredAt: null,
              failuresInARow: 3,
              alerts: { bankImport: true, backups: false, mail: true },
            }),
            pushSubscription(),
          ],
        }),
      );
    });

    it('then each block is a card that holds its own heading over plain rows', () => {
      for (const title of [
        'Co se hlídá',
        'Toto zařízení',
        'Zkušební upozornění',
        'Další zařízení',
      ]) {
        const card = section(title);
        expect(card.classList).toContain('ui-card');
        expect(card.querySelector('h2')?.classList).toContain('ui-card__title');
        expect(card.querySelector('.ui-list')).not.toBeNull();
        expect(card.querySelector('.ui-list--inset')).toBeNull();
      }
    });

    it('then the switches and the turn-off row come first and the note of this device closes its card as the footer, as does the note of the test alert', () => {
      const card = section('Toto zařízení');
      const deviceNote = card.querySelector('.ui-card__footer');
      expect(withOrdinarySpaces(deviceNote?.textContent)).toContain(
        'Upozornění máte na tomto zařízení zapnutá',
      );
      expect(card.querySelectorAll('.ui-card__footer').length).toBe(1);
      const turnOff = button('Vypnout na tomto zařízení');
      expect(turnOff.closest('ul')).toBe(switches(card)[0].closest('ul'));
      expect(
        deviceNote!.compareDocumentPosition(turnOff) & Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
      expect(
        Array.from(card.querySelectorAll('*')).some(
          (element) =>
            deviceNote!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING &&
            (withOrdinarySpaces(element.textContent) ?? '').trim() !== '' &&
            !deviceNote!.contains(element),
        ),
      ).toBe(false);
      expect(section('Zkušební upozornění').querySelector('.ui-card__footer')?.id).toBe(
        'alerts-test-note',
      );
    });

    it('then this device shows its last delivery too', () => {
      expect(sectionText('Toto zařízení')).toContain('Naposledy doručeno 3. 11. 2026 10:05.');
    });

    it('then the test alert stands on its own and its row says where it goes and what to check when it does not come', () => {
      expect(described(button('Poslat zkušební upozornění'))).toBe(
        'Přijde na všechna vaše zařízení, na kterých upozornění máte zapnutá. Pokud do minuty nedorazí, zkontrolujte, že má zařízení pro tento web povolená oznámení a není v režimu Nerušit.',
      );
      expect(sectionText('Toto zařízení')).not.toContain('zkušební');
    });

    it('then each switch of this device is named by its area and says what it reports', () => {
      const [bank, backups, mail] = switches(section('Toto zařízení'));

      expect(withOrdinarySpaces(bank.labels?.[0]?.textContent)).toContain('Import plateb z banky');
      expect(described(bank)).toBe(
        'Když se platby z banky přestanou stahovat a když se zase stahují.',
      );
      expect(described(backups)).toBe('Když záloha selže nebo chybí a když je zase v pořádku.');
      expect(described(mail)).toBe('Když server e-mail neodešle a když zase odesílá.');
    });

    it('then it shows the switches of this device and lists the other one with its delivery', () => {
      expect(switches(section('Toto zařízení')).map((box) => box.checked)).toEqual([
        true,
        true,
        true,
      ]);
      expect(sectionText('Další zařízení')).toContain('Apple, zapnuto 30. 10. 2026');
      expect(sectionText('Další zařízení')).toContain('Zatím nic nedoručeno.');
      expect(sectionText('Další zařízení')).toContain('Nedoručeno 3× po sobě.');
      expect(text('.others .ui-list__value')).toBe('2 ze 3 upozornění');
      expect(switches(section('Další zařízení'))).toEqual([]);
    });

    it('and the other device is opened, then a sheet shows its switches and its removal', async () => {
      await openOtherDevice('Apple, zapnuto 30. 10. 2026');

      expect(withOrdinarySpaces(sheet().querySelector('h2')?.textContent)?.trim()).toBe(
        'Apple, zapnuto 30. 10. 2026',
      );
      expect(switches(sheet()).map((box) => box.checked)).toEqual([true, false, true]);
      expect(button('Odebrat zařízení Apple, zapnuto 30.\u00a010. 2026')).toBeTruthy();
    });

    it('and a switch changes, then the three switches are put and the change confirmed', async () => {
      const mail = switches(section('Toto zařízení'))[2];
      mail.checked = false;
      mail.dispatchEvent(new Event('change'));
      await settle();

      const thisDevice = switches(section('Toto zařízení'));
      expect(thisDevice.every((box) => box.getAttribute('aria-disabled') === 'true')).toBe(true);
      expect(thisDevice.some((box) => box.disabled)).toBe(false);
      thisDevice[0].checked = false;
      thisDevice[0].dispatchEvent(new Event('change'));
      await settle();
      expect(thisDevice[0].checked).toBe(true);
      const request = http.expectOne({
        method: 'PUT',
        url: `${PUSH_URL}/subscriptions/push-this-device/alerts`,
      });
      expect(request.request.body).toEqual({ bankImport: true, backups: true, mail: false });
      request.flush(
        pushSubscription({
          current: false,
          alerts: { bankImport: true, backups: true, mail: false },
        }),
      );
      await settle();

      expect(status()).toContain('Uloženo pro toto zařízení: Odesílání e-mailů – vypnuto.');
      expect(switches(section('Toto zařízení')).map((box) => box.checked)).toEqual([
        true,
        true,
        false,
      ]);
    });

    it('and saving a switch fails, then the switch goes back and the failure is shown', async () => {
      await openOtherDevice('Apple, zapnuto 30. 10. 2026');
      const backups = switches(sheet())[1];
      backups.checked = true;
      backups.dispatchEvent(new Event('change'));
      await settle();
      http
        .expectOne({ method: 'PUT', url: `${PUSH_URL}/subscriptions/push-phone/alerts` })
        .flush(null, { status: 500, statusText: 'Error' });
      await settle();

      expect(alerts()).toContain('Změnu se nepodařilo uložit.');
      expect(status()).not.toContain('Uloženo');
      expect(switches(sheet())[1].checked).toBe(false);
    });

    it('and a test alert is sent, then the counts are reported in Czech', async () => {
      button('Poslat zkušební upozornění').click();
      await settle();

      const sending = button('Posíláme zkušební upozornění…');
      expect(sending.disabled).toBe(true);
      expect(labelFaces(sending)).toEqual([
        'Poslat zkušební upozornění',
        'Posíláme zkušební upozornění…',
      ]);
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush({ delivered: 1, failed: 0, removed: 0 });
      await settle();

      expect(status()).toBe('Zkušební upozornění jsme předali k doručení na 1 zařízení.');
    });

    it('and the test alert reaches no device, then the page says what to do', async () => {
      button('Poslat zkušební upozornění').click();
      await settle();
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush({ delivered: 0, failed: 0, removed: 2 });
      await settle();

      expect(status()).toContain(
        'Zkušební upozornění se nepodařilo předat na žádné zařízení. Zapněte upozornění znovu na zařízení, kde je chcete dostávat.',
      );
      http.expectOne({ method: 'GET', url: PUSH_URL }).flush(adminPush());
    });

    it('and a test alert finds gone devices, then the counts name them and the list is read again', async () => {
      button('Poslat zkušební upozornění').click();
      await settle();
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush({ delivered: 1, failed: 2, removed: 2 });
      await settle();

      expect(status()).toBe(
        'Zkušební upozornění jsme předali k doručení na 1 zařízení. Na 2 zařízení se ho předat nepodařilo. 2 zařízení už upozornění nepřijímala, a tak jsme je odebrali.',
      );
      http
        .expectOne({ method: 'GET', url: PUSH_URL })
        .flush(adminPush({ subscriptions: [pushSubscription()] }));
    });

    it('and the test is refused by the rate limit, then the refusal is shown', async () => {
      button('Poslat zkušební upozornění').click();
      await settle();
      const limited = problem(
        429,
        'operations/rate-limited',
        'Příliš mnoho pokusů',
        'Zkuste to za hodinu.',
      );
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush(limited.body, limited.options);
      await settle();

      expect(alerts()).toContain('Příliš mnoho pokusů. Zkuste to za hodinu.');
    });

    it('and this device is turned off, then it is removed on the server, unsubscribed in the browser and offered again', async () => {
      await TestBed.inject(DeviceAlertMarks).markOwner(sampleDonor().id);
      button('Vypnout na tomto zařízení').click();
      await settle();
      const turningOff = button('Vypínáme…');
      expect(turningOff.disabled).toBe(true);
      expect(labelFaces(turningOff)).toEqual(['Vypnout na tomto zařízení', 'Vypínáme…']);
      http
        .expectOne({ method: 'DELETE', url: `${PUSH_URL}/subscriptions/push-this-device` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      await vi.waitFor(async () => {
        await settle();
        expect(status()).toContain('Upozornění jsme na tomto zařízení vypnuli.');
      });

      expect(push.unsubscribe).toHaveBeenCalled();
      expect(await TestBed.inject(DeviceAlertMarks).ownedBy(sampleDonor().id)).toBe(false);
      expect(button('Zapnout upozornění na tomto zařízení')).toBeTruthy();
      expect(withOrdinarySpaces(document.activeElement?.textContent)?.trim()).toBe('Toto zařízení');
    });

    it('and the other device is being removed, then its button names the running removal', async () => {
      await openOtherDevice('Apple, zapnuto 30. 10. 2026');
      button('Odebrat zařízení Apple, zapnuto 30.\u00a010. 2026').click();
      await settle();

      const removing = button('Odebíráme zařízení Apple, zapnuto 30.\u00a010. 2026');
      expect(removing.disabled).toBe(true);
      expect(labelFaces(removing)).toEqual(['Odebrat zařízení', 'Odebíráme…']);
      expect(accessibleText(removing)).toBe('Odebíráme…');
      http
        .expectOne({ method: 'DELETE', url: `${PUSH_URL}/subscriptions/push-phone` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      expect(withOrdinarySpaces(document.activeElement?.textContent)?.trim()).toBe(
        'Další zařízení',
      );
    });

    it('and a switch of the other device is saved, then the line names that device', async () => {
      await openOtherDevice('Apple, zapnuto 30. 10. 2026');
      const bank = switches(sheet())[0];
      bank.checked = false;
      bank.dispatchEvent(new Event('change'));
      await settle();
      http.expectOne({ method: 'PUT', url: `${PUSH_URL}/subscriptions/push-phone/alerts` }).flush(
        pushSubscription({
          id: 'push-phone',
          service: 'apple',
          current: false,
          createdAt: '2026-10-30T10:00:00Z',
          alerts: { bankImport: false, backups: false, mail: true },
        }),
      );
      await settle();

      expect(status()).toContain(
        'Uloženo pro Apple (30. 10. 2026): Import plateb z banky – vypnuto.',
      );
    });

    it('and the other device is removed, then the sheet closes and it leaves the list', async () => {
      await openOtherDevice('Apple, zapnuto 30. 10. 2026');
      button('Odebrat zařízení Apple, zapnuto 30.\u00a010. 2026').click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${PUSH_URL}/subscriptions/push-phone` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(push.unsubscribe).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
      expect(status()).toContain('Zařízení Apple jsme odebrali');
      expect(sectionText('Další zařízení')).toContain(
        'Na jiném zařízení upozornění zapnutá nemáte.',
      );
    });
  });

  it('when the server lists this device but the browser no longer holds its subscription, then the page says so and offers turning on again', async () => {
    withPushApi();
    push.browserSubscription.mockResolvedValue('not-subscribed');
    await open(adminPush({ subscriptions: [pushSubscription()] }));

    expect(sectionText('Toto zařízení')).toContain(
      'Prohlížeč ale upozornění od tohoto webu už nepřijímá',
    );
    const card = section('Toto zařízení');
    const warning = card.querySelector('.ui-callout--warning');
    const again = button('Zapnout znovu');
    expect(withOrdinarySpaces(warning?.textContent)).toContain('už nepřijímá');
    expect(again.classList).toContain('ui-button--primary');
    expect(warning!.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      again.compareDocumentPosition(switches(card)[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(withOrdinarySpaces(card.querySelector('.ui-card__footer')?.textContent)).not.toContain(
      'už nepřijímá',
    );
    again.click();
    await settle();
    expect(again.disabled).toBe(true);
    expect(labelFaces(again)).toEqual(['Zapnout znovu', 'Zapínáme upozornění…']);
    expect(accessibleText(again)).toBe('Zapínáme upozornění…');
    push.browserSubscription.mockResolvedValue('subscribed');
    http
      .expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` })
      .flush(pushSubscription(), { status: 201, statusText: 'Created' });
    await settle();
    http
      .expectOne({ method: 'GET', url: PUSH_URL })
      .flush(adminPush({ subscriptions: [pushSubscription()] }));
    await settle();

    expect(sectionText('Toto zařízení')).not.toContain('už nepřijímá');
  });

  it('when the server lists this device but notifications are now blocked, then the page says how to allow them', async () => {
    withPushApi('denied');
    await open(adminPush({ subscriptions: [pushSubscription()] }));

    expect(sectionText('Toto zařízení')).toContain(
      'Prohlížeč ale upozornění tohoto webu teď blokuje',
    );
    expect(
      withOrdinarySpaces(
        section('Toto zařízení').querySelector('.ui-callout--warning')?.textContent,
      ),
    ).toContain('teď blokuje');
    expect(() => button('Zapnout znovu')).toThrow();
  });

  it('when notifications are blocked for the site, then the page says how to allow them', async () => {
    withPushApi('denied');
    await open();

    expect(sectionText('Toto zařízení')).toContain(
      'Upozornění má tento web v prohlížeči zakázaná.',
    );
    expect(
      withOrdinarySpaces(section('Toto zařízení').querySelector('.ui-card__footer')?.textContent),
    ).toContain('Upozornění má tento web v prohlížeči zakázaná.');
  });

  it('when the browser has no Push API, then the page says so', async () => {
    await open();

    expect(sectionText('Toto zařízení')).toContain('Tento prohlížeč upozornění z webu neumí.');
  });

  it('when no worker controls the page at first and one takes over, then the offer appears', async () => {
    withPushApi();
    const changes = new Subject<void>();
    push = { ...fakePush(changes), isEnabled: false } as FakePush;
    await open();

    expect(sectionText('Toto zařízení')).toContain('Prohlížeč zatím nespustil část webu');

    (push as { isEnabled: boolean }).isEnabled = true;
    changes.next();
    await settle();

    expect(button('Zapnout upozornění na tomto zařízení')).toBeTruthy();
  });

  describe('when no worker controls the page and none takes over', () => {
    beforeEach(async () => {
      withPushApi();
      push = { ...fakePush(), isEnabled: false } as FakePush;
      await open();
    });

    it('then the page says what to do when trying again does not help, without telling to reload the page', () => {
      expect(sectionText('Toto zařízení')).toContain(
        'Prohlížeč zatím nespustil část webu, která upozornění doručuje. Pokud zpráva nezmizí, prohlížeč ji nejspíš nepovoluje, například v anonymním okně.',
      );
      expect(sectionText('Toto zařízení')).not.toContain('Načtěte stránku znovu');
    });

    it('then the button to try again sits with the sentence in the footer of the device card', () => {
      const footer = section('Toto zařízení').querySelector('.ui-card__footer.device-retry');

      expect(withOrdinarySpaces(footer?.textContent)).toContain(
        'Prohlížeč zatím nespustil část webu',
      );
      expect(withOrdinarySpaces(footer?.querySelector('button')?.textContent)?.trim()).toBe(
        'Zkusit znovu',
      );
    });

    it('then trying again loads the page again and asks for the focus on the device heading after it', () => {
      button('Zkusit znovu').click();

      expect(reloadFocusing).toHaveBeenCalledWith('alerts-device-title');
      http.expectNone({ method: 'GET', url: PUSH_URL });
    });

    it('then trying again within a minute of the last reload checks again in the page and offers them once a worker runs', async () => {
      reloadFocusing.mockReturnValue(false);
      (push as { isEnabled: boolean }).isEnabled = true;

      button('Zkusit znovu').click();
      http.expectOne({ method: 'GET', url: PUSH_URL }).flush(adminPush());
      await settle();

      expect(button('Zapnout upozornění na tomto zařízení')).toBeTruthy();
    });
  });

  it('when the page starts after it asked to load itself again, then the focus goes to the device heading', async () => {
    focusAfterReload = 'alerts-device-title';
    withPushApi();
    push = { ...fakePush(), isEnabled: false } as FakePush;
    fixture = TestBed.createComponent(AdminAlerts);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: PUSH_URL }).flush(adminPush());
    await settle();
    await settle();

    expect(document.activeElement?.id).toBe('alerts-device-title');
    fixture.nativeElement.remove();
  });

  it('when the server cannot push, then the page says so', async () => {
    fixture = TestBed.createComponent(AdminAlerts);
    fixture.detectChanges();
    const unavailable = problem(409, 'operations/push-unavailable', 'Nelze', 'Nelze.');
    http.expectOne(PUSH_URL).flush(unavailable.body, unavailable.options);
    await settle();

    expect(text('[role="alert"]')).toContain('Server teď upozornění posílat neumí');
  });

  it('when the load is refused as the session is gone, then the administrator is sent home to sign in', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const dialog = vi.spyOn(TestBed.inject(LoginDialogService), 'open');
    fixture = TestBed.createComponent(AdminAlerts);
    fixture.detectChanges();
    const refused = problem(401, 'auth/unauthenticated', 'Přihlaste se', 'Chybí token.');
    http.expectOne(PUSH_URL).flush(refused.body, refused.options);
    http.expectOne('/api/donors/auth/logout').flush(null);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/');
    expect(dialog).toHaveBeenCalledWith('login', expect.anything());
  });

  it('when the load is refused as the account is no administrator, then the page goes to the donor overview', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AdminAlerts);
    fixture.detectChanges();
    const refused = problem(403, 'auth/forbidden', 'Přístup odepřen', 'Jen pro správce.');
    http.expectOne(PUSH_URL).flush(refused.body, refused.options);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });

  it('when the load is refused by the rate limit, then the page names the refusal', async () => {
    fixture = TestBed.createComponent(AdminAlerts);
    fixture.detectChanges();
    const limited = problem(429, 'operations/rate-limited', 'Příliš mnoho pokusů', 'Za chvíli.');
    http.expectOne(PUSH_URL).flush(limited.body, limited.options);
    await settle();

    expect(text('[role="alert"]')).toContain('Příliš mnoho pokusů. Za chvíli.');
  });

  it('when the page fails to load, then a retry reads it again', async () => {
    fixture = TestBed.createComponent(AdminAlerts);
    fixture.detectChanges();
    http.expectOne(PUSH_URL).flush(null, { status: 500, statusText: 'Error' });
    await settle();

    expect(loadFailureAlerts(fixture.nativeElement)).toEqual(['Upozornění se nepodařilo načíst.']);
    expect(alertsHoldingAButton(fixture.nativeElement)).toBe(0);
    const retry = pressLoadFailureRetry(fixture.nativeElement);
    fixture.detectChanges();
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(retry);
    expect(loadFailureAlerts(fixture.nativeElement)).toEqual(['Upozornění se nepodařilo načíst.']);
    http.expectOne(PUSH_URL).flush(adminPush());
    await settle();

    expect(text('h2')).toBe('Co se hlídá');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1'));
  });

  describe('when the page was shown once and is opened again', () => {
    const phone = pushSubscription({
      id: 'push-phone',
      service: 'apple',
      current: false,
      createdAt: '2026-10-30T10:00:00Z',
      lastDeliveredAt: null,
      failuresInARow: 0,
    });

    beforeEach(async () => {
      withPushApi();
      await open(adminPush({ subscriptions: [phone, pushSubscription()] }));
      fixture.destroy();
      fixture = TestBed.createComponent(AdminAlerts);
      fixture.detectChanges();
    });

    it('then the devices show at once, without the loading line, and are refreshed behind them', async () => {
      expect(withOrdinarySpaces(fixture.nativeElement.textContent)).not.toContain('Načítáme');
      expect(sectionText('Další zařízení')).toContain('Apple');

      http
        .expectOne({ method: 'GET', url: PUSH_URL })
        .flush(adminPush({ subscriptions: [pushSubscription()] }));
      await settle();

      expect(sectionText('Další zařízení')).toContain(
        'Na jiném zařízení upozornění zapnutá nemáte.',
      );
    });

    it('then a refresh refused because the role was taken away meanwhile still sends the page to the overview', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const forbidden = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

      http.expectOne({ method: 'GET', url: PUSH_URL }).flush(forbidden.body, forbidden.options);
      await settle();

      expect(navigate).toHaveBeenCalledWith('/darce/prehled');
    });

    it('then a device removed before the refresh answers does not come back with that answer, and the list is asked for again', async () => {
      const refresh = http.expectOne({ method: 'GET', url: PUSH_URL });
      await openOtherDevice('Apple, zapnuto 30. 10. 2026');
      button('Odebrat zařízení Apple, zapnuto 30.\u00a010. 2026').click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${PUSH_URL}/subscriptions/push-phone` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      refresh.flush(adminPush({ subscriptions: [phone, pushSubscription()] }));
      await settle();

      expect(sectionText('Další zařízení')).toContain(
        'Na jiném zařízení upozornění zapnutá nemáte.',
      );
      http.expectOne({ method: 'GET', url: PUSH_URL }).flush(
        adminPush({
          subscriptions: [
            pushSubscription({ alerts: { bankImport: false, backups: true, mail: true } }),
          ],
        }),
      );
      await settle();
      expect(switches(section('Toto zařízení')).map((box) => box.checked)).toEqual([
        false,
        true,
        true,
      ]);

      fixture.destroy();
      fixture = TestBed.createComponent(AdminAlerts);
      fixture.detectChanges();
      expect(sectionText('Další zařízení')).toContain(
        'Na jiném zařízení upozornění zapnutá nemáte.',
      );
      http
        .expectOne({ method: 'GET', url: PUSH_URL })
        .flush(adminPush({ subscriptions: [pushSubscription()] }));
      await settle();
    });

    it('then a switch saved while the refresh answers keeps the saved switch, and the list is asked for again', async () => {
      const refresh = http.expectOne({ method: 'GET', url: PUSH_URL });
      const mail = switches(section('Toto zařízení'))[2];
      mail.checked = false;
      mail.dispatchEvent(new Event('change'));
      await settle();
      const save = http.expectOne({
        method: 'PUT',
        url: `${PUSH_URL}/subscriptions/push-this-device/alerts`,
      });

      refresh.flush(adminPush({ subscriptions: [phone, pushSubscription()] }));
      await settle();
      save.flush(pushSubscription({ alerts: { bankImport: true, backups: true, mail: false } }));
      await settle();

      expect(switches(section('Toto zařízení')).map((box) => box.checked)).toEqual([
        true,
        true,
        false,
      ]);
      http.expectOne({ method: 'GET', url: PUSH_URL }).flush(
        adminPush({
          subscriptions: [
            phone,
            pushSubscription({ alerts: { bankImport: true, backups: true, mail: false } }),
          ],
        }),
      );
      await settle();
      expect(switches(section('Toto zařízení'))[2].checked).toBe(false);
    });

    it('then the kept answer is not handed to the badge, only the fresh one', async () => {
      const accept = vi.spyOn(TestBed.inject(OpenAlerts), 'accept');
      fixture.destroy();
      fixture = TestBed.createComponent(AdminAlerts);
      fixture.detectChanges();

      expect(accept).not.toHaveBeenCalled();
      http
        .match({ method: 'GET', url: PUSH_URL })
        .filter((request) => !request.cancelled)
        .forEach((request) => request.flush(adminPush()));
      await settle();
      expect(accept).toHaveBeenCalled();
    });
  });
});
