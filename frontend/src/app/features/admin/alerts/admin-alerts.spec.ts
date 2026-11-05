import type { Mock } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';

import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { AppBadge } from '../../../core/push/app-badge';
import {
  DevicePushSubscription,
  NO_PUSH,
  SERVICE_WORKER_PUSH,
  ServiceWorkerPush,
} from '../../../core/push/service-worker-push';
import { adminPush, PUSH_PUBLIC_KEY, pushSubscription } from '../testing/admin-fixtures';
import { AdminAlerts } from './admin-alerts';

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
  requestSubscription: Mock<(publicKey: string) => Promise<DevicePushSubscription>>;
  unsubscribe: Mock<() => Promise<void>>;
};

function fakePush(controllerChanges = new Subject<void>()): FakePush {
  return {
    ...NO_PUSH,
    isEnabled: true,
    controllerChanges,
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

  function checkboxes(within: HTMLElement): HTMLInputElement[] {
    return Array.from(within.querySelectorAll('input[type="checkbox"]'));
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
        ['Zálohy', 'Nefunguje od 04. 11. 2026 06:15', '/sprava/zalohy'],
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
  });

  it('when the administrator turns the alerts on, then the browser subscribes with the server key and the device is posted', async () => {
    withPushApi();
    await open();

    button('Zapnout upozornění na tomto zařízení').click();
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
    expect(checkboxes(section('Toto zařízení')).map((box) => box.checked)).toEqual([
      true,
      true,
      true,
    ]);
    expect(button('Poslat zkušební upozornění')).toBeTruthy();
  });

  it('when the browser refuses the permission, then the page says how to allow notifications', async () => {
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

    it('then it shows the switches of this device and lists the other one with its delivery', () => {
      expect(checkboxes(section('Toto zařízení')).map((box) => box.checked)).toEqual([
        true,
        true,
        true,
      ]);
      expect(sectionText('Další zařízení')).toContain('Apple, zapnuto 30. 10. 2026');
      expect(sectionText('Další zařízení')).toContain('Zatím nic nedoručeno.');
      expect(sectionText('Další zařízení')).toContain('Nedoručeno 3× po sobě.');
      expect(checkboxes(section('Další zařízení')).map((box) => box.checked)).toEqual([
        true,
        false,
        true,
      ]);
    });

    it('and a switch changes, then the three switches are put and the change confirmed', async () => {
      const mail = checkboxes(section('Toto zařízení'))[2];
      mail.checked = false;
      mail.dispatchEvent(new Event('change'));
      await settle();

      expect(checkboxes(section('Toto zařízení')).every((box) => box.disabled)).toBe(true);
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

      expect(status()).toContain('Uloženo: Odesílání e-mailů – vypnuto.');
      expect(checkboxes(section('Toto zařízení')).map((box) => box.checked)).toEqual([
        true,
        true,
        false,
      ]);
    });

    it('and saving a switch fails, then the switch goes back and the failure is shown', async () => {
      const backups = checkboxes(section('Další zařízení'))[1];
      backups.checked = true;
      backups.dispatchEvent(new Event('change'));
      await settle();
      http
        .expectOne({ method: 'PUT', url: `${PUSH_URL}/subscriptions/push-phone/alerts` })
        .flush(null, { status: 500, statusText: 'Error' });
      await settle();

      expect(alerts()).toContain('Změnu se nepodařilo uložit.');
      expect(checkboxes(section('Další zařízení'))[1].checked).toBe(false);
    });

    it('and a test alert is sent, then the counts are reported in Czech', async () => {
      button('Poslat zkušební upozornění').click();
      await settle();

      expect(button('Posíláme zkušební upozornění…').disabled).toBe(true);
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush({ delivered: 1, failed: 0, removed: 0 });
      await settle();

      expect(status()).toBe('Zkušební upozornění jsme předali ke doručení na 1 zařízení.');
    });

    it('and a test alert finds gone devices, then the counts name them and the list is read again', async () => {
      button('Poslat zkušební upozornění').click();
      await settle();
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush({ delivered: 1, failed: 2, removed: 2 });
      await settle();

      expect(status()).toBe(
        'Zkušební upozornění jsme předali ke doručení na 1 zařízení. Na 2 zařízení se ho předat nepodařilo. 2 zařízení už upozornění nepřijímala, a tak jsme je odebrali.',
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
      button('Vypnout na tomto zařízení').click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${PUSH_URL}/subscriptions/push-this-device` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(push.unsubscribe).toHaveBeenCalled();
      expect(status()).toContain('Upozornění jsme na tomto zařízení vypnuli.');
      expect(button('Zapnout upozornění na tomto zařízení')).toBeTruthy();
    });

    it('and the other device is removed, then it leaves the list', async () => {
      button('Odebrat zařízení Apple, zapnuto 30. 10. 2026').click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${PUSH_URL}/subscriptions/push-phone` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(push.unsubscribe).not.toHaveBeenCalled();
      expect(status()).toContain('Zařízení Apple jsme odebrali');
      expect(sectionText('Další zařízení')).toContain(
        'Na jiném zařízení upozornění zapnutá nemáte.',
      );
    });
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
});
