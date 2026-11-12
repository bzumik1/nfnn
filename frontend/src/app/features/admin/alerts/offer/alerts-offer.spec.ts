import type { Mock } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { APP_JAR, BROWSER_JAR, SESSION_JAR, SessionJar } from '../../../../core/auth/session-jar';
import { authResponse, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import {
  BrowserPushSubscriptionState,
  DevicePushSubscription,
  NO_PUSH,
  NotificationPermissionAnswer,
  SERVICE_WORKER_PUSH,
  ServiceWorkerPush,
} from '../../../../core/push/service-worker-push';
import { ADMINISTRATION_LOCK } from '../../shell/administration-lock';
import { adminPush, PUSH_PUBLIC_KEY, pushSubscription } from '../../testing/admin-fixtures';
import { DeviceAlertMarks } from '../device-alert-marks';
import { AlertsOffer } from './alerts-offer';

const PUSH_URL = '/api/admin/operations/push';

@Component({ template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class AnyPage {}
const JANA = sampleDonor().id;
const DEVICE: DevicePushSubscription = {
  endpoint: 'https://web.push.apple.com/this-phone',
  p256dh: 'BKeyOfThisPhone',
  auth: 'authOfThisPhone',
};

type FakePush = ServiceWorkerPush & {
  requestPermission: Mock<() => Promise<NotificationPermissionAnswer>>;
  requestSubscription: Mock<(publicKey: string) => Promise<DevicePushSubscription>>;
  browserSubscription: Mock<() => Promise<BrowserPushSubscriptionState>>;
  unsubscribe: Mock<() => Promise<void>>;
};

function fakePush(): FakePush {
  return {
    ...NO_PUSH,
    isEnabled: true,
    requestPermission: vi.fn<() => Promise<NotificationPermissionAnswer>>(() =>
      Promise.resolve('granted'),
    ),
    browserSubscription: vi.fn<() => Promise<BrowserPushSubscriptionState>>(() =>
      Promise.resolve('not-subscribed'),
    ),
    requestSubscription: vi.fn<(publicKey: string) => Promise<DevicePushSubscription>>(() =>
      Promise.resolve(DEVICE),
    ),
    unsubscribe: vi.fn(() => Promise.resolve()),
  };
}

function withPushApi(permission: NotificationPermission): void {
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });
}

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

describe('Given an administrator in the administration', () => {
  let fixture: ComponentFixture<AlertsOffer> | null;
  let http: HttpTestingController;
  let push: FakePush;
  let locked: WritableSignal<boolean>;
  let offline: WritableSignal<boolean>;
  let marks: DeviceAlertMarks;

  async function configure(jar: SessionJar): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AlertsOffer],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', component: AnyPage }]),
        { provide: SESSION_JAR, useValue: jar },
        { provide: SERVICE_WORKER_PUSH, useFactory: () => push },
        { provide: Connectivity, useFactory: () => ({ offline }) },
        {
          provide: ADMINISTRATION_LOCK,
          useFactory: () => ({
            locked,
            panel: signal(null),
            keepsPage: signal(false),
            firstDownload: signal(null),
          }),
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    marks = TestBed.inject(DeviceAlertMarks);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round += 1) {
      await new Promise((done) => setTimeout(done));
      await fixture?.whenStable();
      fixture?.detectChanges();
    }
  }

  async function start(url = '/sprava'): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(AlertsOffer);
    fixture.detectChanges();
    await settle();
  }

  async function answerPush(answer: object = adminPush()): Promise<void> {
    http.expectOne({ method: 'GET', url: PUSH_URL }).flush(answer);
    await settle();
  }

  function sheet(): HTMLElement | null {
    return document.querySelector('dialog');
  }

  function sheetText(): string {
    return (sheet()?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(
      (sheet()?.querySelectorAll('button, a') ?? []) as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.trim() === name);
    if (found === undefined) {
      throw new Error(`No button named ${name}`);
    }
    return found;
  }

  beforeEach(() => {
    localStorage.clear();
    fixture = null;
    push = fakePush();
    locked = signal(false);
    offline = signal(false);
  });

  afterEach(() => {
    fixture?.destroy();
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(window, 'Notification');
    http.verify();
    localStorage.clear();
  });

  describe('when the installed app opens unlocked and online on a device without alerts', () => {
    beforeEach(async () => {
      withPushApi('default');
      await configure(APP_JAR);
      await start();
      await answerPush();
    });

    it('then a sheet offers to turn the alerts on and says what they report', () => {
      expect(sheet()?.querySelector('h2')?.textContent?.trim()).toBe('Zapnout upozornění?');
      expect(sheetText()).toContain(
        'Dostanete zprávu, když selže import plateb, záloha nebo odeslání e-mailu, a znovu, až to zase funguje.',
      );
      expect(button('Zapnout')).toBeTruthy();
      expect(button('Teď ne')).toBeTruthy();
      expect(push.requestPermission).not.toHaveBeenCalled();
    });

    it('and they turn them on, then the browser is asked within the tap, every kind goes on, a test alert goes out and the device is theirs', async () => {
      button('Zapnout').click();
      expect(push.requestPermission).toHaveBeenCalledTimes(1);
      await settle();

      expect(push.requestSubscription).toHaveBeenCalledWith(PUSH_PUBLIC_KEY);
      const subscribe = http.expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` });
      expect(subscribe.request.body).toEqual({
        endpoint: DEVICE.endpoint,
        keys: { p256dh: DEVICE.p256dh, auth: DEVICE.auth },
      });
      subscribe.flush(pushSubscription(), { status: 201, statusText: 'Created' });
      await settle();
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush({ delivered: 1, failed: 0, removed: 0 });
      await settle();

      expect(sheet()?.querySelector('h2')?.textContent?.trim()).toBe('Upozornění jsou zapnutá');
      expect(sheetText()).toContain('Poslali jsme zkušební upozornění');
      expect(await marks.ownedBy(JANA)).toBe(true);
      expect(button('Hotovo')).toBeTruthy();
    });

    it('and the test alert cannot go out, then the alerts are still on and the sheet says where to try the test', async () => {
      button('Zapnout').click();
      await settle();
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` })
        .flush(pushSubscription(), { status: 201, statusText: 'Created' });
      await settle();
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/test` })
        .flush(null, { status: 500, statusText: 'Error' });
      await settle();

      expect(sheet()?.querySelector('h2')?.textContent?.trim()).toBe('Upozornění jsou zapnutá');
      expect(sheetText()).toContain('Zkušební upozornění se teď poslat nepodařilo');
    });

    it('and they put it off, then nothing is asked or sent and the offer stays away for 30 days', async () => {
      button('Teď ne').click();
      await settle();

      expect(sheet()).toBeNull();
      expect(marks.offerHidden()).toBe(true);
      expect(push.requestPermission).not.toHaveBeenCalled();
    });

    it('and the device refuses the permission, then nothing is subscribed and the sheet says where to allow it', async () => {
      push.requestPermission.mockResolvedValue('denied');

      button('Zapnout').click();
      await settle();

      expect(push.requestSubscription).not.toHaveBeenCalled();
      expect(sheet()?.querySelector('h2')?.textContent?.trim()).toBe('Upozornění jsou vypnutá');
      expect(sheetText()).toContain('Nastavení → Oznámení');
      expect(marks.offerHidden()).toBe(true);
      expect(await marks.ownedBy(JANA)).toBe(false);
    });

    it('and the server refuses the device, then the browser lets it go and the sheet offers another try', async () => {
      button('Zapnout').click();
      await settle();
      const refused = problem(500, 'internal', 'Chyba serveru', 'Zkuste to později.');
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` })
        .flush(refused.body, refused.options);
      await settle();

      expect(push.unsubscribe).toHaveBeenCalled();
      expect(sheet()?.querySelector('[role="alert"]')?.textContent).toContain(
        'Chyba serveru. Zkuste to později.',
      );
      expect(button('Zkusit znovu')).toBeTruthy();
      expect(await marks.ownedBy(JANA)).toBe(false);
    });

    it('and they already have ten devices, then the sheet points to removing one on the alerts page', async () => {
      button('Zapnout').click();
      await settle();
      const limit = problem(409, 'operations/push-subscription-limit', 'Limit', 'Deset.');
      http
        .expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` })
        .flush(limit.body, limit.options);
      await settle();

      expect(sheet()?.querySelector('[role="alert"]')?.textContent).toContain(
        'nejvýš na 10 zařízeních',
      );
    });
  });

  it('when the administration opens on the alerts page itself, then the page offers the alerts and no sheet does', async () => {
    withPushApi('default');
    await configure(APP_JAR);
    await start('/sprava/upozorneni');

    http.expectNone(PUSH_URL);
    expect(sheet()).toBeNull();
  });

  it('when the site runs in a browser tab, then nothing is offered and the server is not asked', async () => {
    withPushApi('default');
    await configure(BROWSER_JAR);
    await start();

    http.expectNone(PUSH_URL);
    expect(sheet()).toBeNull();
  });

  it('when the administration is locked, then the offer waits for the unlock', async () => {
    withPushApi('default');
    locked.set(true);
    await configure(APP_JAR);
    await start();
    http.expectNone(PUSH_URL);

    locked.set(false);
    await settle();
    await answerPush();

    expect(sheet()?.querySelector('h2')?.textContent?.trim()).toBe('Zapnout upozornění?');
  });

  it('when the app is offline, then the offer waits until it is online again', async () => {
    withPushApi('default');
    offline.set(true);
    await configure(APP_JAR);
    await start();
    http.expectNone(PUSH_URL);

    offline.set(false);
    await settle();
    await answerPush();

    expect(sheet()).not.toBeNull();
  });

  it('when the offer was put off less than 30 days ago, then nothing is offered', async () => {
    withPushApi('default');
    await configure(APP_JAR);
    marks.hideOffer();
    await start();

    http.expectNone(PUSH_URL);
    expect(sheet()).toBeNull();
  });

  it('when the device has notifications blocked, then nothing is offered', async () => {
    withPushApi('denied');
    await configure(APP_JAR);
    await start();

    http.expectNone(PUSH_URL);
    expect(sheet()).toBeNull();
  });

  it('when this device already has the alerts on, then nothing is offered', async () => {
    withPushApi('granted');
    await configure(APP_JAR);
    await start();
    await answerPush(adminPush({ subscriptions: [pushSubscription()] }));

    expect(sheet()).toBeNull();
    expect(push.requestSubscription).not.toHaveBeenCalled();
  });

  it('when the sign-in names no device, then nothing is offered', async () => {
    withPushApi('default');
    await configure(APP_JAR);
    await start();
    await answerPush(adminPush({ deviceSession: false }));

    expect(sheet()).toBeNull();
  });

  it('when the device already allows notifications and this administrator turned the alerts on here last, then they come back on without a question or a test alert', async () => {
    withPushApi('granted');
    await configure(APP_JAR);
    await marks.markOwner(JANA);
    await start();
    await answerPush();

    expect(sheet()).toBeNull();
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(push.requestSubscription).toHaveBeenCalledWith(PUSH_PUBLIC_KEY);
    http
      .expectOne({ method: 'POST', url: `${PUSH_URL}/subscriptions` })
      .flush(pushSubscription(), { status: 201, statusText: 'Created' });
    await settle();
    http.expectNone(`${PUSH_URL}/test`);
  });

  it('when the device allows notifications but another administrator turned the alerts on here, then this one is asked first', async () => {
    withPushApi('granted');
    await configure(APP_JAR);
    await marks.markOwner('0b1c2d3e-0000-4000-8000-000000000002');
    await start();
    await answerPush();

    expect(push.requestSubscription).not.toHaveBeenCalled();
    expect(sheet()?.querySelector('h2')?.textContent?.trim()).toBe('Zapnout upozornění?');
  });
});
