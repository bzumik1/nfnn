import { TestBed } from '@angular/core/testing';
import { SwRegistrationOptions, SwUpdate, VersionEvent } from '@angular/service-worker';
import { firstValueFrom, Subject, toArray } from 'rxjs';

import {
  provideAppServiceWorker,
  SERVICE_WORKER_REGISTRATION,
  SERVICE_WORKER_SCRIPT,
} from './angular-service-worker';
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
});
