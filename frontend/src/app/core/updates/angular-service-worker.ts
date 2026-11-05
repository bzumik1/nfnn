import { DOCUMENT } from '@angular/common';
import { EnvironmentProviders, inject, isDevMode, makeEnvironmentProviders } from '@angular/core';
import { provideServiceWorker, SwUpdate, VersionEvent } from '@angular/service-worker';
import { filter, map, Observable } from 'rxjs';

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
      return updates.isEnabled && (view?.navigator.serviceWorker?.controller ?? null) !== null;
    },
    versionEvents,
    unrecoverable: updates.unrecoverable.pipe(map((event) => event.reason)),
    checkForUpdate: () => updates.checkForUpdate(),
    activateUpdate: () => updates.activateUpdate(),
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
  ]);
}
