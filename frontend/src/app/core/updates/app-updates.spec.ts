import { HttpHeaders } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { ErrorReporter } from '../errors/error-reporter';
import { ExternalNavigation } from '../navigation/external-navigation';
import { ReloadGuard } from '../reload/reload-guard';
import { ServerVersion } from '../version/server-version';
import { AppUpdates, START_UP_WINDOW_MS, UPDATE_CHECK_TIMEOUT_MS } from './app-updates';
import { DirtyForms } from './dirty-forms';
import {
  SERVICE_WORKER_UPDATES,
  ServiceWorkerUpdates,
  ServiceWorkerVersionEvent,
} from './service-worker-updates';

@Component({ template: '' })
class Page {}

interface Setup {
  readonly updates: AppUpdates;
  readonly router: Router;
  readonly dirtyForms: DirtyForms;
  readonly versions: Subject<ServiceWorkerVersionEvent>;
  readonly unrecoverable: Subject<string>;
  readonly loadFromServer: ReturnType<typeof vi.fn>;
  readonly claim: ReturnType<typeof vi.fn>;
  readonly report: ReturnType<typeof vi.fn>;
  readonly checkForUpdate: ReturnType<typeof vi.fn>;
}

function setUp(enabled = true): Setup {
  history.replaceState(null, '', '/');
  const versions = new Subject<ServiceWorkerVersionEvent>();
  const unrecoverable = new Subject<string>();
  const loadFromServer = vi.fn();
  const claim = vi.fn(() => true);
  const report = vi.fn();
  const checkForUpdate = vi.fn(() => Promise.resolve(true));
  const serviceWorker: ServiceWorkerUpdates = {
    isEnabled: enabled,
    versionEvents: versions,
    unrecoverable,
    checkForUpdate,
    activateUpdate: () => Promise.resolve(true),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: Page },
        { path: 'aktuality', component: Page },
        { path: 'kontakt', component: Page },
      ]),
      { provide: SERVICE_WORKER_UPDATES, useValue: serviceWorker },
      { provide: ExternalNavigation, useValue: { loadFromServer } },
      { provide: ReloadGuard, useValue: { claim } },
      { provide: ErrorReporter, useValue: { report } },
    ],
  });
  const updates = TestBed.inject(AppUpdates);
  updates.start();
  return {
    updates,
    router: TestBed.inject(Router),
    dirtyForms: TestBed.inject(DirtyForms),
    versions,
    unrecoverable,
    loadFromServer,
    claim,
    report,
    checkForUpdate,
  };
}

function press(): void {
  window.dispatchEvent(new Event('pointerdown'));
}

describe('Given the app just started with its service worker', () => {
  afterEach(() => vi.useRealTimers());

  it('when a new version is ready before the visitor did anything, then the page reloads into it at once', () => {
    const { versions, loadFromServer, claim } = setUp();

    versions.next({ type: 'ready' });

    expect(claim).toHaveBeenCalledWith('update');
    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  it('when a new version is ready after the visitor pressed something, then nothing reloads on the page', () => {
    const { versions, loadFromServer, updates } = setUp();
    press();

    versions.next({ type: 'ready' });

    expect(loadFromServer).not.toHaveBeenCalled();
    expect(updates.versionReady()).toBe(true);
  });

  for (const input of ['scroll', 'wheel', 'touchstart'] as const) {
    it(`when a new version is ready after the visitor began to read the page (${input}), then nothing reloads on the page`, () => {
      const { versions, loadFromServer } = setUp();
      window.dispatchEvent(new Event(input));

      versions.next({ type: 'ready' });

      expect(loadFromServer).not.toHaveBeenCalled();
    });
  }

  it('when the first page opened at an address the router redirected, then a version ready right after still reloads at once', async () => {
    const { versions, loadFromServer, router } = setUp();
    await router.navigateByUrl('/aktuality');

    versions.next({ type: 'ready' });

    expect(loadFromServer).toHaveBeenCalledTimes(1);
  });

  it('when the page changed its own address since the start, as a page that took a link code off it does, then nothing reloads on the page', async () => {
    const { versions, loadFromServer, router } = setUp();
    await router.navigateByUrl('/');
    history.replaceState(null, '', '/potvrzeni-emailu');

    versions.next({ type: 'ready' });

    expect(loadFromServer).not.toHaveBeenCalled();
  });

  it('when a new version is ready before the visitor did anything but a form already holds text, then nothing reloads on the page', () => {
    const { versions, loadFromServer, dirtyForms, updates } = setUp();
    dirtyForms.register(() => true);

    versions.next({ type: 'ready' });

    expect(loadFromServer).not.toHaveBeenCalled();
    expect(updates.versionReady()).toBe(true);
  });

  it('when a new version is ready later than the start-up window, then nothing reloads on the page', () => {
    vi.useFakeTimers();
    const { versions, loadFromServer } = setUp();
    vi.advanceTimersByTime(START_UP_WINDOW_MS);

    versions.next({ type: 'ready' });

    expect(loadFromServer).not.toHaveBeenCalled();
  });

  it('when a new version is only detected, then nothing reloads and it is not ready yet', () => {
    const { versions, loadFromServer, updates } = setUp();

    versions.next({ type: 'detected' });

    expect(loadFromServer).not.toHaveBeenCalled();
    expect(updates.versionReady()).toBe(false);
  });

  it('when the reload guard refuses another automatic reload, then the page stays', () => {
    const { versions, loadFromServer, claim } = setUp();
    claim.mockReturnValue(false);

    versions.next({ type: 'ready' });

    expect(loadFromServer).not.toHaveBeenCalled();
  });

  it('when installing a new version fails, then it is reported and nothing reloads', () => {
    const { versions, loadFromServer, report } = setUp();

    versions.next({
      type: 'installation-failed',
      error: 'Hash mismatch (cacheBustedFetchFromNetwork)',
    });

    expect(report).toHaveBeenCalledWith('sw-install', 'service-worker');
    expect(loadFromServer).not.toHaveBeenCalled();
  });
});

describe('Given a new version is ready while the visitor reads a page', () => {
  let setup: Setup;

  beforeEach(async () => {
    setup = setUp();
    await setup.router.navigateByUrl('/aktuality');
    press();
    setup.versions.next({ type: 'ready' });
  });

  it('when the visitor opens another page, then that page is loaded from the server in the new version', async () => {
    await setup.router.navigateByUrl('/kontakt');

    expect(setup.loadFromServer).toHaveBeenCalledWith('/kontakt');
    expect(setup.claim).toHaveBeenCalledWith('update');
  });

  for (const address of ['/aktuality?strana=2', '/aktuality#nejnovejsi']) {
    it(`when the visitor stays on the page and only its query or section changes (${address}), then nothing reloads, and the next page loads the new version`, async () => {
      await setup.router.navigateByUrl(address);

      expect(setup.loadFromServer).not.toHaveBeenCalled();

      await setup.router.navigateByUrl('/kontakt');

      expect(setup.loadFromServer).toHaveBeenCalledWith('/kontakt');
    });
  }

  it('when a half-typed form is on the page, then nothing reloads while it stays there', () => {
    setup.dirtyForms.register(() => true);

    expect(setup.loadFromServer).not.toHaveBeenCalled();
  });

  describe('when the visitor leaves a half-typed form', () => {
    it('then the next page opens in the app first and loads the new version only once the form is gone', async () => {
      const unregister = setup.dirtyForms.register(() => true);
      const navigation = setup.router.navigateByUrl('/kontakt');
      expect(setup.loadFromServer).not.toHaveBeenCalled();
      unregister();

      await navigation;

      expect(setup.loadFromServer).toHaveBeenCalledWith('/kontakt');
    });

    it('and the next page holds a half-typed form too, then nothing reloads until it is gone and the visitor moves on', async () => {
      setup.dirtyForms.register(() => true);

      await setup.router.navigateByUrl('/kontakt');

      expect(setup.loadFromServer).not.toHaveBeenCalled();
    });
  });
});

describe('Given the service worker reports an unrecoverable state', () => {
  it('when no form is half-typed, then it is reported and the page reloads', () => {
    const { unrecoverable, loadFromServer, report, claim, updates } = setUp();
    press();

    unrecoverable.next('Hash mismatch');

    expect(report).toHaveBeenCalledWith('sw-unrecoverable', 'service-worker');
    expect(claim).toHaveBeenCalledWith('unrecoverable');
    expect(loadFromServer).toHaveBeenCalledWith('/');
    expect(updates.mustReload()).toBe(false);
  });

  it('when a form is half-typed, then nothing reloads and the page asks to load the new version', () => {
    const { unrecoverable, loadFromServer, dirtyForms, updates } = setUp();
    dirtyForms.register(() => true);

    unrecoverable.next('Hash mismatch');

    expect(loadFromServer).not.toHaveBeenCalled();
    expect(updates.mustReload()).toBe(true);
  });

  it('when the reload guard refuses, then the page asks to load the new version', () => {
    const { unrecoverable, claim, updates } = setUp();
    claim.mockReturnValue(false);

    unrecoverable.next('Hash mismatch');

    expect(updates.mustReload()).toBe(true);
  });
});

describe('Given someone asks for the new version', () => {
  afterEach(() => vi.useRealTimers());

  it('when no service worker runs, then the page loads from the server at once', () => {
    const { updates, loadFromServer, checkForUpdate } = setUp(false);

    updates.loadNewVersion('/darce/prehled');

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(loadFromServer).toHaveBeenCalledWith('/darce/prehled');
  });

  it('when the service worker runs, then it fetches the new version first and loads the page after', async () => {
    const { updates, loadFromServer, checkForUpdate } = setUp();
    let found: (value: boolean) => void = () => undefined;
    checkForUpdate.mockReturnValue(new Promise<boolean>((resolve) => (found = resolve)));

    updates.loadNewVersion('/darce/prehled');
    await Promise.resolve();
    expect(loadFromServer).not.toHaveBeenCalled();
    found(true);
    await vi.waitFor(() => expect(loadFromServer).toHaveBeenCalledWith('/darce/prehled'));
  });

  it('when the check for a new version hangs, then the page loads after the time limit anyway', async () => {
    vi.useFakeTimers();
    const { updates, loadFromServer, checkForUpdate } = setUp();
    checkForUpdate.mockReturnValue(new Promise<boolean>(() => undefined));

    updates.loadNewVersion('/');
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_TIMEOUT_MS);

    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  it('when the check for a new version fails, then the page loads anyway', async () => {
    const { updates, loadFromServer, checkForUpdate } = setUp();
    checkForUpdate.mockReturnValue(Promise.reject(new Error('offline')));

    updates.loadNewVersion('/');

    await vi.waitFor(() => expect(loadFromServer).toHaveBeenCalledWith('/'));
  });
});

describe('Given the service worker runs while the visitor keeps the tab open', () => {
  function answerFrom(revision: string): void {
    TestBed.inject(ServerVersion).observe(
      new HttpHeaders({ 'Cache-Control': 'no-store', 'Nfnn-Revision': revision }),
    );
    TestBed.tick();
  }

  it('when an answer names the build the app runs, then no new version is asked for', () => {
    const { checkForUpdate } = setUp();

    answerFrom('dev');

    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it('when answers name another build, then the service worker looks for it once per build', () => {
    const { checkForUpdate } = setUp();

    answerFrom('abc1234');
    answerFrom('abc1234');
    answerFrom('def5678');

    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('when the look for the new build fails, then nothing else happens', async () => {
    const { checkForUpdate, loadFromServer } = setUp();
    checkForUpdate.mockImplementation(() => Promise.reject(new Error('offline')));

    answerFrom('abc1234');
    await Promise.resolve();

    expect(loadFromServer).not.toHaveBeenCalled();
  });

  it('when no service worker runs, then another build is not looked for', () => {
    const { checkForUpdate } = setUp(false);

    answerFrom('abc1234');

    expect(checkForUpdate).not.toHaveBeenCalled();
  });
});
