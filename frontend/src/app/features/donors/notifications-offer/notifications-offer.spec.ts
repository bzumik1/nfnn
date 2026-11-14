import type { Mock } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { throwError } from 'rxjs';

import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { APP_JAR, BROWSER_JAR, SESSION_JAR, SessionJar } from '../../../core/auth/session-jar';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { Connectivity } from '../../../core/connectivity/connectivity';
import {
  DevicePushSubscription,
  NO_PUSH,
  NotificationPermissionAnswer,
  SERVICE_WORKER_PUSH,
  ServiceWorkerPush,
} from '../../../core/push/service-worker-push';
import { DonorDonationsRepository } from '../../donations/device-copy/donor-donations-repository';
import { PaymentHandOffs } from '../../donations/payment-panel/payment-hand-offs';
import { DonorPushApi } from '../../operations/donor-push-api';
import { FakeDonorPushApi } from '../../operations/testing/donor-push-fixtures';
import { NOTIFICATIONS_OFFER_HIDDEN_KEY, NotificationsOffer } from './notifications-offer';

@Component({ template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class AnyPage {}

const DEVICE: DevicePushSubscription = {
  endpoint: 'https://web.push.apple.com/this-phone',
  p256dh: 'BKeyOfThisPhone',
  auth: 'authOfThisPhone',
};

type FakePush = ServiceWorkerPush & {
  requestPermission: Mock<() => Promise<NotificationPermissionAnswer>>;
  requestSubscription: Mock<(publicKey: string) => Promise<DevicePushSubscription>>;
};

function fakePush(): FakePush {
  return {
    ...NO_PUSH,
    isEnabled: true,
    requestPermission: vi.fn<() => Promise<NotificationPermissionAnswer>>(() =>
      Promise.resolve('granted'),
    ),
    requestSubscription: vi.fn<(publicKey: string) => Promise<DevicePushSubscription>>(() =>
      Promise.resolve(DEVICE),
    ),
  };
}

function withPushApi(permission: NotificationPermission = 'default'): void {
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });
}

describe('Given a donor in the app on the home screen', () => {
  let fixture: ComponentFixture<NotificationsOffer> | null;
  let http: HttpTestingController;
  let push: FakePush;
  let offline: WritableSignal<boolean>;
  let gifts: WritableSignal<{ items: readonly unknown[] } | null>;
  let api: FakeDonorPushApi;

  async function configure(jar: SessionJar = APP_JAR): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [NotificationsOffer],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', component: AnyPage }]),
        { provide: SESSION_JAR, useValue: jar },
        { provide: SERVICE_WORKER_PUSH, useFactory: () => push },
        { provide: Connectivity, useFactory: () => ({ offline }) },
        { provide: DonorDonationsRepository, useFactory: () => ({ held: gifts }) },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(DonorPushApi) as unknown as FakeDonorPushApi;
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor()));
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round += 1) {
      await new Promise((done) => setTimeout(done));
      await fixture?.whenStable();
      fixture?.detectChanges();
    }
  }

  async function start(url = '/darce/prehled'): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(NotificationsOffer);
    fixture.detectChanges();
    await settle();
  }

  function sheetText(): string {
    return (document.querySelector('dialog')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function button(name: string): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('dialog button')).find(
      (candidate) => (candidate.textContent ?? '').replace(/\s+/g, ' ').trim() === name,
    );
  }

  beforeEach(() => {
    localStorage.clear();
    fixture = null;
    push = fakePush();
    offline = signal(false);
    gifts = signal({ items: [{ id: 'gift-1' }] });
  });

  afterEach(() => {
    fixture?.destroy();
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(window, 'Notification');
    http.verify();
  });

  it('when the app opens for a donor who already gave and this phone has no notifications, then the sheet asks once and turning on sends the confirmation', async () => {
    withPushApi();
    await configure();
    const subscribe = vi.spyOn(api, 'subscribe');
    const test = vi.spyOn(api, 'test');
    await start();

    expect(sheetText()).toContain('Chcete vědět, až dar dorazí?');
    expect(push.requestPermission).not.toHaveBeenCalled();

    button('Zapnout')!.click();
    await settle();

    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({
      endpoint: DEVICE.endpoint,
      keys: { p256dh: DEVICE.p256dh, auth: DEVICE.auth },
    });
    expect(test).toHaveBeenCalledTimes(1);
    expect(sheetText()).toContain('Upozornění jsou zapnutá');
  });

  it('when the donor puts the offer off, then it hides for thirty days and is not shown again', async () => {
    withPushApi();
    await configure();
    await start();

    button('Teď ne')!.click();
    await settle();

    expect(document.querySelector('dialog')).toBeNull();
    const until = Number(localStorage.getItem(NOTIFICATIONS_OFFER_HIDDEN_KEY));
    expect(until - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it('when the donor has not given yet, then nothing is offered at start, but coming back from the bank app after handing a payment over offers it', async () => {
    withPushApi();
    gifts.set({ items: [] });
    await configure();
    await start();
    expect(document.querySelector('dialog')).toBeNull();

    TestBed.inject(PaymentHandOffs).note();
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();

    expect(sheetText()).toContain('Chcete vědět, až dar dorazí?');
  });

  it('when the phone refuses the permission, then the sheet says where to allow it and the offer hides', async () => {
    withPushApi();
    push.requestPermission.mockResolvedValue('denied');
    await configure();
    await start();

    button('Zapnout')!.click();
    await settle();

    expect(sheetText()).toContain('Zařízení upozornění pro tuto aplikaci nepovolilo.');
    expect(localStorage.getItem(NOTIFICATIONS_OFFER_HIDDEN_KEY)).not.toBeNull();
  });

  it('when the server refuses the device, then the reason and another try are shown', async () => {
    withPushApi();
    await configure();
    vi.spyOn(api, 'subscribe').mockReturnValue(throwError(() => new Error('refused')));
    await start();

    button('Zapnout')!.click();
    await settle();

    expect(sheetText()).toContain('Upozornění se nepodařilo zapnout.');
    expect(button('Zkusit znovu')).toBeTruthy();
  });

  it.each([
    ['in a browser tab', BROWSER_JAR, '/darce/prehled', null],
    ['in the administration', APP_JAR, '/sprava', null],
    ['when this phone already gets them', APP_JAR, '/darce/prehled', 'device'],
  ])('when the app opens %s, then nothing is offered', async (_, jar, url, device) => {
    withPushApi();
    await configure(jar);
    if (device !== null) {
      api.answer = {
        ...api.answer,
        device: {
          service: 'apple',
          notifications: { gifts: true, yearlyReceipts: true },
          createdAt: '2026-11-12T09:00:00Z',
          lastDeliveredAt: null,
          failuresInARow: 0,
        },
      };
    }
    await start(url);

    expect(document.querySelector('dialog')).toBeNull();
  });

  it('when the site blocks notifications, then nothing is offered', async () => {
    withPushApi('denied');
    await configure();
    await start();

    expect(document.querySelector('dialog')).toBeNull();
  });
});
