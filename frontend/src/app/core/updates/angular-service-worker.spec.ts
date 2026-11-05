import { TestBed } from '@angular/core/testing';
import { SwPush, SwRegistrationOptions, SwUpdate, VersionEvent } from '@angular/service-worker';
import { firstValueFrom, Subject, toArray } from 'rxjs';

import {
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

    it('when the device was not subscribed, then unsubscribing still succeeds', async () => {
      controlledBy({});
      const swPush = angularPush();

      await expect(pushWith(swPush).unsubscribe()).resolves.toBeUndefined();
      expect(swPush.unsubscribe).toHaveBeenCalled();
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
