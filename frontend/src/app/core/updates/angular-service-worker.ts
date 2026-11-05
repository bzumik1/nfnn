import { DOCUMENT } from '@angular/common';
import { EnvironmentProviders, inject, isDevMode, makeEnvironmentProviders } from '@angular/core';
import { provideServiceWorker, SwPush, SwUpdate, VersionEvent } from '@angular/service-worker';
import { filter, map, Observable } from 'rxjs';

import {
  devicePushSubscriptionOf,
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
    requestSubscription: async (publicKey) =>
      devicePushSubscriptionOf(await push.requestSubscription({ serverPublicKey: publicKey })),
    unsubscribe: () => push.unsubscribe().catch(() => undefined),
  };
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
