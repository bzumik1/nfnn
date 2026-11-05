import { DOCUMENT } from '@angular/common';
import { EnvironmentProviders, inject, isDevMode, makeEnvironmentProviders } from '@angular/core';
import { provideServiceWorker, SwPush, SwUpdate, VersionEvent } from '@angular/service-worker';
import { filter, map, Observable } from 'rxjs';

import {
  BrowserPushSubscriptionState,
  devicePushSubscriptionOf,
  NotificationPermissionAnswer,
  PushNotificationClick,
  SERVICE_WORKER_PUSH,
  ServiceWorkerPush,
} from '../push/service-worker-push';

import {
  SERVICE_WORKER_UPDATES,
  ServiceWorkerUpdates,
  ServiceWorkerVersionEvent,
} from './service-worker-updates';

export const SERVICE_WORKER_SCRIPT = 'ngsw-worker.js';
export const SERVICE_WORKER_REGISTRATION = 'registerWhenStable:30000';
export const PUSH_CALL_TIMEOUT_MS = 5_000;

interface BrowserPushSubscription {
  readonly options?: { readonly applicationServerKey?: ArrayBuffer | null };
  unsubscribe(): Promise<boolean>;
}

interface NotificationSurface {
  readonly permission?: string;
  requestPermission?: () => Promise<string> | undefined;
}

function versionEventOf(event: VersionEvent): ServiceWorkerVersionEvent | null {
  switch (event.type) {
    case 'VERSION_DETECTED':
      return { type: 'detected' };
    case 'VERSION_READY':
      return { type: 'ready' };
    case 'VERSION_INSTALLATION_FAILED':
      return { type: 'installation-failed', error: event.error };
    case 'NO_NEW_VERSION_DETECTED':
      return { type: 'no-new-version' };
    default:
      return null;
  }
}

function updatesOf(updates: SwUpdate, view: Window | null): ServiceWorkerUpdates {
  const versionEvents: Observable<ServiceWorkerVersionEvent> = updates.versionUpdates.pipe(
    map(versionEventOf),
    filter((event): event is ServiceWorkerVersionEvent => event !== null),
  );
  return {
    get isEnabled() {
      return updates.isEnabled && controlledBy(view);
    },
    versionEvents,
    unrecoverable: updates.unrecoverable.pipe(map((event) => event.reason)),
    checkForUpdate: () => updates.checkForUpdate(),
    activateUpdate: () => updates.activateUpdate(),
  };
}

function controlledBy(view: Window | null): boolean {
  return (view?.navigator.serviceWorker?.controller ?? null) !== null;
}

function pushSupportedIn(view: Window | null): boolean {
  return view !== null && 'PushManager' in view && 'Notification' in view;
}

function controllerChangesOf(container: ServiceWorkerContainer | undefined): Observable<void> {
  return new Observable<void>((subscriber) => {
    if (typeof container?.addEventListener !== 'function') {
      return undefined;
    }
    const changed = (): void => subscriber.next();
    container.addEventListener('controllerchange', changed);
    return () => container.removeEventListener('controllerchange', changed);
  });
}

function pushOf(push: SwPush, view: Window | null): ServiceWorkerPush {
  const container = view?.navigator.serviceWorker;
  const notificationClicks: Observable<PushNotificationClick> = push.notificationClicks.pipe(
    map(({ action, notification }) => ({ action, data: notification?.data })),
  );
  return {
    get isEnabled() {
      return push.isEnabled && controlledBy(view) && pushSupportedIn(view);
    },
    controllerChanges: controllerChangesOf(container),
    messages: push.messages,
    notificationClicks,
    requestPermission: () => requestPermissionIn(view),
    requestSubscription: async (publicKey) => {
      const existing = await withinTime(browserSubscriptionIn(container), null);
      if (existing !== null && !holdsKey(existing, publicKey)) {
        await withinTime(
          existing.unsubscribe().then(() => undefined),
          undefined,
        );
      }
      return devicePushSubscriptionOf(
        await push.requestSubscription({ serverPublicKey: publicKey }),
      );
    },
    browserSubscription: () =>
      withinTime<BrowserPushSubscriptionState>(
        browserSubscriptionIn(container).then((subscription) =>
          subscription === null ? 'not-subscribed' : 'subscribed',
        ),
        'unknown',
      ),
    unsubscribe: () =>
      withinTime(
        browserSubscriptionIn(container).then((subscription) =>
          subscription?.unsubscribe().then(() => undefined),
        ),
        undefined,
      ),
  };
}

function requestPermissionIn(view: Window | null): Promise<NotificationPermissionAnswer> {
  const notification = (view as (Window & { Notification?: NotificationSurface }) | null)
    ?.Notification;
  try {
    const asked = notification?.requestPermission?.();
    return Promise.resolve(asked ?? notification?.permission).then(permissionOf, () => 'default');
  } catch {
    return Promise.resolve('default');
  }
}

function permissionOf(answer: string | undefined): NotificationPermissionAnswer {
  return answer === 'granted' || answer === 'denied' ? answer : 'default';
}

function browserSubscriptionIn(
  container: ServiceWorkerContainer | undefined,
): Promise<BrowserPushSubscription | null> {
  if (typeof container?.getRegistration !== 'function') {
    return Promise.resolve(null);
  }
  return container
    .getRegistration()
    .then(
      (registration) =>
        (registration?.pushManager?.getSubscription() ??
          null) as Promise<BrowserPushSubscription | null> | null,
    )
    .then((subscription) => subscription ?? null);
}

function holdsKey(subscription: BrowserPushSubscription, publicKey: string): boolean {
  const held = subscription.options?.applicationServerKey;
  if (!held) {
    return false;
  }
  const heldBytes = new Uint8Array(held);
  const wanted = bytesOfBase64Url(publicKey);
  return (
    wanted !== null &&
    heldBytes.length === wanted.length &&
    heldBytes.every((byte, index) => byte === wanted[index])
  );
}

function bytesOfBase64Url(text: string): Uint8Array | null {
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function withinTime<T>(work: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), PUSH_CALL_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function provideAppServiceWorker(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideServiceWorker(SERVICE_WORKER_SCRIPT, {
      enabled: !isDevMode(),
      registrationStrategy: SERVICE_WORKER_REGISTRATION,
    }),
    {
      provide: SERVICE_WORKER_UPDATES,
      useFactory: () => updatesOf(inject(SwUpdate), inject(DOCUMENT).defaultView),
    },
    {
      provide: SERVICE_WORKER_PUSH,
      useFactory: () => pushOf(inject(SwPush), inject(DOCUMENT).defaultView),
    },
  ]);
}
