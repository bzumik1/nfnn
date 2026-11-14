import type { Mock } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import {
  BrowserPushSubscriptionState,
  DevicePushSubscription,
  NO_PUSH,
  NotificationPermissionAnswer,
  SERVICE_WORKER_PUSH,
  ServiceWorkerPush,
} from '../../../../core/push/service-worker-push';
import { DonorNotifiedDevices } from '../../../operations/donor-notified-devices';
import { DonorPushApi, DonorPushDevice, DonorPushResponse } from '../../../operations/donor-push-api';
import { NotificationsCard } from './notifications-card';

const PUSH_URL = '/api/operations/push';
const ADMIN_PUSH_URL = '/api/admin/operations/push';
const PUBLIC_KEY = `B${'E'.repeat(86)}`;
const DEVICE: DevicePushSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/this-device',
  p256dh: 'BKeyOfThisBrowser',
  auth: 'authOfThisBrowser',
};

type FakePush = ServiceWorkerPush & {
  requestPermission: Mock<() => Promise<NotificationPermissionAnswer>>;
  requestSubscription: Mock<(publicKey: string) => Promise<DevicePushSubscription>>;
  unsubscribe: Mock<() => Promise<void>>;
};

function fakePush(): FakePush {
  return {
    ...NO_PUSH,
    isEnabled: true,
    requestPermission: vi.fn<() => Promise<NotificationPermissionAnswer>>(() =>
      Promise.resolve('granted'),
    ),
    browserSubscription: () => Promise.resolve<BrowserPushSubscriptionState>('subscribed'),
    requestSubscription: vi.fn<(publicKey: string) => Promise<DevicePushSubscription>>(() =>
      Promise.resolve(DEVICE),
    ),
    unsubscribe: vi.fn(() => Promise.resolve()),
  };
}

function device(overrides: Partial<DonorPushDevice> = {}): DonorPushDevice {
  return {
    service: 'google',
    notifications: { gifts: true, yearlyReceipts: true },
    createdAt: '2026-11-12T09:00:00Z',
    lastDeliveredAt: null,
    failuresInARow: 0,
    ...overrides,
  };
}

function pushView(overrides: Partial<DonorPushResponse> = {}): DonorPushResponse {
  return { publicKey: PUBLIC_KEY, deviceSession: true, device: null, devices: [], ...overrides };
}

function withPushApi(permission = 'default'): void {
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });
}

describe('Given a donor on Údaje a zabezpečení with the notifications card', () => {
  let fixture: ComponentFixture<NotificationsCard>;
  let http: HttpTestingController;
  let push: FakePush;

  async function signIn(session: string | undefined, roles: string[] = ['DONOR']): Promise<void> {
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush({ ...authResponse('token-1', sampleDonor({ roles })), session });
  }

  async function open(answer: DonorPushResponse = pushView()): Promise<void> {
    fixture = TestBed.createComponent(NotificationsCard);
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: PUSH_URL }).flush(answer);
    await settle();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function button(name: string): HTMLButtonElement | undefined {
    return Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => (candidate.textContent ?? '').replace(/\s+/g, ' ').trim() === name);
  }

  function switchNamed(name: string): HTMLInputElement {
    const label = Array.from(
      fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>,
    ).find((candidate) => candidate.querySelector('.ui-list__title')?.textContent?.trim() === name);
    const input = label?.querySelector<HTMLInputElement>('input[role="switch"]');
    if (!input) {
      throw new Error(`No switch named ${name}`);
    }
    return input;
  }

  function status(): string {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="status"]'))
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
    await TestBed.configureTestingModule({
      imports: [NotificationsCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SERVICE_WORKER_PUSH, useFactory: () => push },
        { provide: DonorPushApi, useClass: DonorPushApi },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(window, 'Notification');
    http.verify();
  });

  describe('when a remembered sign-in on a browser that can receive them opens the card', () => {
    beforeEach(async () => {
      withPushApi();
      await signIn('REMEMBERED');
      await open(pushView({ devices: ['device-other'] }));
    });

    it('then it offers to turn them on for this device and asks the browser nothing yet', () => {
      expect(button('Zapnout na tomto zařízení')).toBeTruthy();
      expect(push.requestPermission).not.toHaveBeenCalled();
      expect(TestBed.inject(DonorNotifiedDevices).ids()).toEqual(new Set(['device-other']));
    });

    it('then a tap asks the browser, subscribes this device with every kind on, sends the confirmation and shows the switches', async () => {
      button('Zapnout na tomto zařízení')!.click();
      await settle();

      expect(push.requestPermission).toHaveBeenCalledTimes(1);
      expect(push.requestSubscription).toHaveBeenCalledWith(PUBLIC_KEY);
      const subscribe = http.expectOne({ method: 'PUT', url: `${PUSH_URL}/device` });
      expect(subscribe.request.body).toEqual({
        endpoint: DEVICE.endpoint,
        keys: { p256dh: DEVICE.p256dh, auth: DEVICE.auth },
      });
      subscribe.flush(device());
      await settle();
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush({ delivered: 1, failed: 0, removed: 0 });
      http
        .expectOne({ method: 'GET', url: PUSH_URL })
        .flush(pushView({ device: device(), devices: ['device-other', 'device-here'] }));
      await settle();

      expect(status()).toContain(
        'Upozornění jsme na tomto zařízení zapnuli a poslali zkušební upozornění.',
      );
      expect(switchNamed('Dar dorazil').checked).toBe(true);
      expect(switchNamed('Roční potvrzení').checked).toBe(true);
      expect(TestBed.inject(DonorNotifiedDevices).ids()).toEqual(
        new Set(['device-other', 'device-here']),
      );
    });

    it('then a refused permission says where to allow notifications and subscribes nothing', async () => {
      push.requestPermission.mockResolvedValue('denied');

      button('Zapnout na tomto zařízení')!.click();
      await settle();

      expect(push.requestSubscription).not.toHaveBeenCalled();
      expect(alerts()).toContain('Prohlížeč upozornění nezapnul.');
    });
  });

  describe('when this device already gets the notifications', () => {
    beforeEach(async () => {
      withPushApi('granted');
      await signIn('APP');
      await open(
        pushView({
          device: device({ lastDeliveredAt: '2026-11-13T08:05:00Z' }),
          devices: ['device-here'],
        }),
      );
    });

    it('then it shows the switches, when it last delivered, and no name or amount is ever said', () => {
      expect(switchNamed('Dar dorazil').checked).toBe(true);
      expect(text()).toContain('Naposledy doručeno 13. 11. 2026 9:05.');
      expect(text()).toContain('Upozornění neříkají jména ani částky.');
    });

    it('then switching gifts off saves only the switches and says so', async () => {
      const gifts = switchNamed('Dar dorazil');
      gifts.checked = false;
      gifts.dispatchEvent(new Event('change'));
      await settle();

      const change = http.expectOne({ method: 'PUT', url: `${PUSH_URL}/device/notifications` });
      expect(change.request.body).toEqual({ gifts: false, yearlyReceipts: true });
      change.flush(device({ notifications: { gifts: false, yearlyReceipts: true } }));
      await settle();

      expect(status()).toContain('Uloženo: Dar dorazil – vypnuto.');
    });

    it('then turning them off removes this device and lets the browser go, as no administration alerts need it', async () => {
      button('Vypnout na tomto zařízení')!.click();
      await settle();
      http.expectOne({ method: 'DELETE', url: `${PUSH_URL}/device` }).flush(null);
      await settle();
      http.expectOne({ method: 'GET', url: PUSH_URL }).flush(pushView());
      await settle();

      expect(push.unsubscribe).toHaveBeenCalledTimes(1);
      expect(button('Zapnout na tomto zařízení')).toBeTruthy();
      expect(TestBed.inject(DonorNotifiedDevices).ids()).toEqual(new Set());
      expect(status()).toContain('Upozornění jsme na tomto zařízení vypnuli.');
    });
  });

  it('when an administrator whose administration alerts use this browser turns the notifications off, then the browser stays subscribed', async () => {
    withPushApi('granted');
    await signIn('APP', ['DONOR', 'ADMIN']);
    await open(pushView({ device: device(), devices: ['device-here'] }));

    button('Vypnout na tomto zařízení')!.click();
    await settle();
    http.expectOne({ method: 'DELETE', url: `${PUSH_URL}/device` }).flush(null);
    await settle();
    http
      .expectOne({ method: 'GET', url: ADMIN_PUSH_URL })
      .flush({
        publicKey: PUBLIC_KEY,
        deviceSession: true,
        subscriptions: [{ id: 'a', current: true }],
        openAlerts: [],
      });
    await settle();
    http.expectOne({ method: 'GET', url: PUSH_URL }).flush(pushView());
    await settle();

    expect(push.unsubscribe).not.toHaveBeenCalled();
  });

  it.each([
    ['PUBLIC', 'Na cizím počítači upozornění zapnout nejdou.'],
    [
      'BROWSER',
      'Upozornění jdou zapnout jen v aplikaci na ploše nebo po přihlášení se zaškrtnutým Zapamatovat si mě.',
    ],
  ])(
    'when a %s sign-in opens the card, then it says why and offers nothing',
    async (session, why) => {
      withPushApi();
      await signIn(session);
      await open();

      expect(text()).toContain(why);
      expect(button('Zapnout na tomto zařízení')).toBeUndefined();
    },
  );

  it('when Safari on an iPhone opens the card outside the home-screen app, then it points to adding the site to the home screen', async () => {
    const agent = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      );
    withPushApi();
    await signIn('REMEMBERED');
    await open();

    expect(text()).toContain('Na iPhonu a iPadu chodí upozornění jen webu přidanému na plochu.');
    expect(button('Zapnout na tomto zařízení')).toBeUndefined();
    agent.mockRestore();
  });

  it('when the browser blocks the site, then the card says where to allow them', async () => {
    withPushApi('denied');
    await signIn('REMEMBERED');
    await open();

    expect(text()).toContain('Upozornění má tento web v prohlížeči zakázaná.');
  });

  it('when the card cannot load, then it says so and loads again on request', async () => {
    withPushApi();
    await signIn('REMEMBERED');
    fixture = TestBed.createComponent(NotificationsCard);
    fixture.detectChanges();
    http
      .expectOne({ method: 'GET', url: PUSH_URL })
      .flush(null, { status: 500, statusText: 'Error' });
    await settle();

    expect(alerts()).toContain('Upozornění se nepodařilo načíst.');
    button('Načíst znovu')!.click();
    http.expectOne({ method: 'GET', url: PUSH_URL }).flush(pushView());
    await settle();
    expect(button('Zapnout na tomto zařízení')).toBeTruthy();
  });
});
