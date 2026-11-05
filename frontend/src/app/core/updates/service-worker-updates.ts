import { InjectionToken } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';

export type ServiceWorkerVersionEvent =
  | { readonly type: 'detected' }
  | { readonly type: 'ready' }
  | { readonly type: 'installation-failed'; readonly error: string }
  | { readonly type: 'no-new-version' };

export interface ServiceWorkerUpdates {
  readonly isEnabled: boolean;
  readonly versionEvents: Observable<ServiceWorkerVersionEvent>;
  readonly unrecoverable: Observable<string>;
  checkForUpdate(): Promise<boolean>;
  activateUpdate(): Promise<boolean>;
}

export const NO_SERVICE_WORKER: ServiceWorkerUpdates = {
  isEnabled: false,
  versionEvents: EMPTY,
  unrecoverable: EMPTY,
  checkForUpdate: () => Promise.resolve(false),
  activateUpdate: () => Promise.resolve(false),
};

export const SERVICE_WORKER_UPDATES = new InjectionToken<ServiceWorkerUpdates>(
  'SERVICE_WORKER_UPDATES',
  { providedIn: 'root', factory: () => NO_SERVICE_WORKER },
);
