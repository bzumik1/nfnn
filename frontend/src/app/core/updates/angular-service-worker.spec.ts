import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SwPush, SwRegistrationOptions, SwUpdate, VersionEvent } from '@angular/service-worker';
import { firstValueFrom, Subject, toArray } from 'rxjs';

import {
  PUSH_CALL_TIMEOUT_MS,
  provideAppServiceWorker,
  SERVICE_WORKER_REGISTRATION,
  SERVICE_WORKER_SCRIPT,
} from './angular-service-worker';
import { SERVICE_WORKER_PUSH } from '../push/service-worker-push';
import { SERVICE_WORKER_UPDATES } from './service-worker-updates';

function controlledBy(controller: object | null): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller },
  });
}

function angularWorker(): object {
  return {
    isEnabled: true,
    versionUpdates: new Subject<VersionEvent>(),
    unrecoverable: new Subject(),
    checkForUpdate: () => Promise.resolve(true),
    activateUpdate: () => Promise.resolve(true),
  };
}

describe('Given the app service worker providers', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('when no worker controls the page yet, then the app counts the worker as not running', () => {
    controlledBy(null);
    TestBed.configureTestingModule({
      providers: [provideAppServiceWorker(), { provide: SwUpdate, useValue: angularWorker() }],
    });

    expect(TestBed.inject(SERVICE_WORKER_UPDATES).isEnabled).toBe(false);
  });

  it('when they are read, then the Angular worker registers once the app is stable or after 30 seconds', () => {
    TestBed.configureTestingModule({ providers: [provideAppServiceWorker()] });

    expect(SERVICE_WORKER_SCRIPT).toBe('ngsw-worker.js');
    expect(SERVICE_WORKER_REGISTRATION).toBe('registerWhenStable:30000');
    expect(TestBed.inject(SwRegistrationOptions).registrationStrategy).toBe(
      'registerWhenStable:30000',
    );
  });

  it('when the Angular worker reports versions, then the app sees them in its own words and ignores the rest', async () => {
    controlledBy({});
    const versionUpdates = new Subject<VersionEvent>();
    const unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
    TestBed.configureTestingModule({
      providers: [
        provideAppServiceWorker(),
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: true,
            versionUpdates,
            unrecoverable,
            checkForUpdate: () => Promise.resolve(true),
            activateUpdate: () => Promise.resolve(true),
          },
        },
      ],
    });
    const updates = TestBed.inject(SERVICE_WORKER_UPDATES);
    const seen = firstValueFrom(updates.versionEvents.pipe(toArray()));
    const reasons = firstValueFrom(updates.unrecoverable.pipe(toArray()));
    const version = { hash: 'a', appData: {} };

    versionUpdates.next({ type: 'VERSION_DETECTED', version });
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: version, latestVersion: version });
    versionUpdates.next({ type: 'VERSION_INSTALLATION_FAILED', version, error: 'Hash mismatch' });
    versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version });
    versionUpdates.next({
      type: 'VERSION_FAILED',
      version,
      error: 'broken',
    } as unknown as VersionEvent);
    versionUpdates.complete();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'Hash mismatch' });
    unrecoverable.complete();

    expect(updates.isEnabled).toBe(true);
    expect(await seen).toEqual([
      { type: 'detected' },
      { type: 'ready' },
      { type: 'installation-failed', error: 'Hash mismatch' },
      { type: 'no-new-version' },
    ]);
    expect(await reasons).toEqual(['Hash mismatch']);
    expect(await updates.checkForUpdate()).toBe(true);
  });

  describe('Given the push of the Angular worker', () => {
    const pushSurface = ['PushManager', 'Notification'] as const;

    function angularPush(overrides: Record<string, unknown> = {}) {
      return {
        isEnabled: true,
        messages: new Subject<object>(),
        notificationClicks: new Subject<{ action: string; notification: { data?: unknown } }>(),
        requestSubscription: vi.fn(() =>
          Promise.resolve({
            endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
            toJSON: () => ({ keys: { p256dh: 'BPublicKeyOfTheBrowser', auth: 'authSecret' } }),
          }),
        ),
        unsubscribe: vi.fn(() =>
          Promise.reject(new Error('Not subscribed to push notifications.')),
        ),
        ...overrides,
      };
    }

    function withPushSurface(): void {
      for (const name of pushSurface) {
        Object.defineProperty(window, name, { configurable: true, value: class {} });
      }
    }

    function pushWith(swPush: object) {
      TestBed.configureTestingModule({
        providers: [
          provideAppServiceWorker(),
          { provide: SwUpdate, useValue: angularWorker() },
          { provide: SwPush, useValue: swPush },
        ],
      });
      return TestBed.inject(SERVICE_WORKER_PUSH);
    }

    afterEach(() => {
      for (const name of pushSurface) {
        Reflect.deleteProperty(window, name);
      }
    });

    it('when a worker controls the page in a browser with the Push API, then push counts as enabled', () => {
      controlledBy({});
      withPushSurface();

      expect(pushWith(angularPush()).isEnabled).toBe(true);
    });

    it('when the browser has no Push API, then push counts as not enabled', () => {
      controlledBy({});

      expect(pushWith(angularPush()).isEnabled).toBe(false);
    });

    it('when no worker controls the page, then push counts as not enabled', () => {
      controlledBy(null);
      withPushSurface();

      expect(pushWith(angularPush()).isEnabled).toBe(false);
    });

    it('when a device subscribes, then the app gets the endpoint and the two keys of the browser', async () => {
      controlledBy({});
      withPushSurface();
      const swPush = angularPush();

      const subscription = await pushWith(swPush).requestSubscription('BServerKey');

      expect(swPush.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'BServerKey' });
      expect(subscription).toEqual({
        endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
        p256dh: 'BPublicKeyOfTheBrowser',
        auth: 'authSecret',
      });
    });

    it('when the browser answers a subscription without keys, then subscribing fails', async () => {
      controlledBy({});
      withPushSurface();
      const swPush = angularPush({
        requestSubscription: () =>
          Promise.resolve({ endpoint: 'https://fcm.googleapis.com/x', toJSON: () => ({}) }),
      });

      await expect(pushWith(swPush).requestSubscription('BServerKey')).rejects.toThrow();
    });

    function browserSubscription(key: Uint8Array | null) {
      return {
        endpoint: 'https://fcm.googleapis.com/fcm/send/old-device',
        options: { applicationServerKey: key?.buffer ?? null },
        unsubscribe: vi.fn(() => Promise.resolve(true)),
      };
    }

    function registeredWith(
      subscription: object | null,
      controller: object | null = {},
    ): { getSubscription: Mock<() => Promise<object | null>> } {
      const pushManager = { getSubscription: vi.fn(() => Promise.resolve(subscription)) };
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { controller, getRegistration: () => Promise.resolve({ pushManager }) },
      });
      return pushManager;
    }

    function keyBytes(publicKey: string): Uint8Array {
      const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
        c.charCodeAt(0),
      );
    }

    const SERVER_KEY = `B${'A'.repeat(86)}`;
    const OTHER_KEY = `B${'Q'.repeat(86)}`;

    it('when the device was not subscribed, then unsubscribing still succeeds', async () => {
      registeredWith(null);

      await expect(pushWith(angularPush()).unsubscribe()).resolves.toBeUndefined();
    });

    it('when no worker controls the page, then unsubscribing still ends the browser subscription through the registration', async () => {
      const subscription = browserSubscription(keyBytes(SERVER_KEY));
      registeredWith(subscription, null);
      const swPush = angularPush({ unsubscribe: vi.fn(() => new Promise<void>(() => undefined)) });

      await expect(pushWith(swPush).unsubscribe()).resolves.toBeUndefined();
      expect(subscription.unsubscribe).toHaveBeenCalled();
    });

    it('when the registration never answers, then unsubscribing gives up after a while instead of hanging', async () => {
      vi.useFakeTimers();
      try {
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: { controller: null, getRegistration: () => new Promise(() => undefined) },
        });
        let settled = false;
        void pushWith(angularPush())
          .unsubscribe()
          .then(() => (settled = true));

        await vi.advanceTimersByTimeAsync(PUSH_CALL_TIMEOUT_MS);

        expect(settled).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('when the browser holds a subscription under another server key, then it is ended before subscribing again', async () => {
      withPushSurface();
      const old = browserSubscription(keyBytes(OTHER_KEY));
      registeredWith(old);
      const swPush = angularPush();

      await pushWith(swPush).requestSubscription(SERVER_KEY);

      expect(old.unsubscribe).toHaveBeenCalled();
      expect(swPush.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: SERVER_KEY });
    });

    it('when the browser holds a subscription under the same server key, then it is kept', async () => {
      withPushSurface();
      const same = browserSubscription(keyBytes(SERVER_KEY));
      registeredWith(same);
      const swPush = angularPush();

      await pushWith(swPush).requestSubscription(SERVER_KEY);

      expect(same.unsubscribe).not.toHaveBeenCalled();
      expect(swPush.requestSubscription).toHaveBeenCalled();
    });

    it('when the browser is asked, then it says whether it still holds a push subscription', async () => {
      const pushManager = registeredWith(browserSubscription(keyBytes(SERVER_KEY)));
      const push = pushWith(angularPush());

      expect(await push.browserSubscription()).toBe('subscribed');

      pushManager.getSubscription.mockResolvedValue(null);

      expect(await push.browserSubscription()).toBe('not-subscribed');
    });

    it('when the page asks for the permission, then the browser is asked at once and its answer returned', async () => {
      controlledBy({});
      const requestPermission = vi.fn(() => Promise.resolve('granted'));
      Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: { permission: 'default', requestPermission },
      });
      const push = pushWith(angularPush());

      const answer = push.requestPermission();

      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(await answer).toBe('granted');
    });

    it('when a notification is clicked, then the app sees the action and the data of the notification', async () => {
      controlledBy({});
      const swPush = angularPush();
      const push = pushWith(swPush);
      const clicks = firstValueFrom(push.notificationClicks);

      swPush.notificationClicks.next({ action: '', notification: { data: { kind: 'test' } } });

      expect(await clicks).toEqual({ action: '', data: { kind: 'test' } });
    });
  });
});
