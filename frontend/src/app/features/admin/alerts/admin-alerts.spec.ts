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
import { AdminAlerts } from './admin-alerts';
import { DeviceAlertMarks } from './device-alert-marks';

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
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function section(title: string): HTMLElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('section') as NodeListOf<HTMLElement>,
    ).find((candidate) => candidate.querySelector('h2')?.textContent?.trim() === title);
    if (found === undefined) {
      throw new Error(`No section titled ${title}`);
    }
    return found;
  }

  function sectionText(title: string): string {
    return (section(title).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find(
      (candidate) =>
        candidate.textContent?.trim() === name || candidate.getAttribute('aria-label') === name,
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
      .map((id) => document.getElementById(id)?.textContent ?? '')
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
    ).find((candidate) => candidate.querySelector('.ui-list__title')?.textContent?.trim() === name);
    if (row === undefined) {
      throw new Error(`No device row named ${name}`);
    }
    row.click();
    await settle();
  }

  function status(): string {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="status"]:not(:empty)'))
      .map((element) => ((element as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((line) => line !== '')
      .join(' | ');
  }

  function alerts(): string {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="alert"]'))
      .map((element) => ((element as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((line) => line !== '')
      .join(' | ');
  }

  beforeEach(async () => {
    localStorage.clear();
    push = fakePush();
    badge = { show: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AdminAlerts],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SERVICE_WORKER_PUSH, useFactory: () => push },
        { provide: AppBadge, useFactory: () => badge },
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
        link.querySelector('.ui-list__title')?.textContent?.trim(),
        link.querySelector('.ui-list__meta')?.textContent?.trim(),
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
    expect(button('Zapínáme upozornění…').disabled).toBe(true);
    const request = http.expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` });
    expect(request.request.body).toEqual({
      endpoint: DEVICE.endpoint,
      keys: { p256dh: DEVICE.p256dh, auth: DEVICE.auth },
    });
    request.flush(pushSubscription(), { status: 201, statusText: 'Created' });
    await settle();

    expect(status()).toContain('Upozornění jsme na tomto zařízení zapnuli.');
    expect(document.activeElement?.textContent?.trim()).toBe('Toto zařízení');
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

      expect(bank.labels?.[0]?.textContent).toContain('Import plateb z banky');
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
      expect(sectionText('Další zařízení')).toContain('2 ze 3');
      expect(switches(section('Další zařízení'))).toEqual([]);
    });

    it('and the other device is opened, then a sheet shows its switches and its removal', async () => {
      await openOtherDevice('Apple, zapnuto 30. 10. 2026');

      expect(sheet().querySelector('h2')?.textContent?.trim()).toBe('Apple, zapnuto 30. 10. 2026');
      expect(switches(sheet()).map((box) => box.checked)).toEqual([true, false, true]);
      expect(button('Odebrat zařízení Apple, zapnuto 30. 10. 2026')).toBeTruthy();
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

      expect(button('Posíláme zkušební upozornění…').disabled).toBe(true);
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
      http
        .expectOne({ method: 'DELETE', url: `${PUSH_URL}/subscriptions/push-this-device` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(push.unsubscribe).toHaveBeenCalled();
      expect(status()).toContain('Upozornění jsme na tomto zařízení vypnuli.');
      expect(await TestBed.inject(DeviceAlertMarks).ownedBy(sampleDonor().id)).toBe(false);
      expect(button('Zapnout upozornění na tomto zařízení')).toBeTruthy();
      expect(document.activeElement?.textContent?.trim()).toBe('Toto zařízení');
    });

    it('and the other device is being removed, then its button names the running removal', async () => {
      await openOtherDevice('Apple, zapnuto 30. 10. 2026');
      button('Odebrat zařízení Apple, zapnuto 30. 10. 2026').click();
      await settle();

      expect(button('Odebíráme zařízení Apple, zapnuto 30. 10. 2026').textContent?.trim()).toBe(
        'Odebíráme…',
      );
      http
        .expectOne({ method: 'DELETE', url: `${PUSH_URL}/subscriptions/push-phone` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      expect(document.activeElement?.textContent?.trim()).toBe('Další zařízení');
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
      button('Odebrat zařízení Apple, zapnuto 30. 10. 2026').click();
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
    button('Zapnout znovu').click();
    await settle();
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
    expect(() => button('Zapnout znovu')).toThrow();
  });

  it('when notifications are blocked for the site, then the page says how to allow them', async () => {
    withPushApi('denied');
    await open();

    expect(sectionText('Toto zařízení')).toContain(
      'Upozornění má tento web v prohlížeči zakázaná.',
    );
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

    expect(text('[role="alert"]')).toContain('Upozornění se nepodařilo načíst.');
    button('Zkusit znovu').click();
    http.expectOne(PUSH_URL).flush(adminPush());
    await settle();

    expect(text('h2')).toBe('Co se hlídá');
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
      expect(fixture.nativeElement.textContent).not.toContain('Načítáme');
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
      button('Odebrat zařízení Apple, zapnuto 30. 10. 2026').click();
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
