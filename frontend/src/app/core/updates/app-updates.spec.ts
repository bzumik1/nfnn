import { HttpHeaders } from '@angular/common/http';
import { Component, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { Connectivity } from '../connectivity/connectivity';
import { ErrorReporter } from '../errors/error-reporter';
import { ExternalNavigation } from '../navigation/external-navigation';
import { ReloadGuard } from '../reload/reload-guard';
import { ReloadPlace } from '../reload/reload-place';
import { API_GENERATION } from '../version/api-generation';
import { ServerVersion } from '../version/server-version';
import {
  AppUpdates,
  START_UP_WINDOW_MS,
  UPDATE_CHECK_TIMEOUT_MS,
  UPDATED_FOR_KEY,
} from './app-updates';
import { DirtyForms } from './dirty-forms';
import { RunningWork } from './running-work';
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
  readonly running: RunningWork;
  readonly offline: WritableSignal<boolean>;
  readonly versions: Subject<ServiceWorkerVersionEvent>;
  readonly unrecoverable: Subject<string>;
  readonly loadFromServer: ReturnType<typeof vi.fn>;
  readonly claim: ReturnType<typeof vi.fn>;
  readonly report: ReturnType<typeof vi.fn>;
  readonly checkForUpdate: ReturnType<typeof vi.fn>;
  readonly keep: ReturnType<typeof vi.fn>;
}

function setUp(enabled = true): Setup {
  history.replaceState(null, '', '/');
  const versions = new Subject<ServiceWorkerVersionEvent>();
  const unrecoverable = new Subject<string>();
  const loadFromServer = vi.fn();
  const claim = vi.fn(() => true);
  const report = vi.fn();
  const checkForUpdate = vi.fn(() => Promise.resolve(true));
  const keep = vi.fn();
  const offline = signal(false);
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
      { provide: ReloadPlace, useValue: { keep } },
      { provide: Connectivity, useValue: { offline, browserSaysOffline: () => false } },
    ],
  });
  const updates = TestBed.inject(AppUpdates);
  updates.start();
  return {
    updates,
    router: TestBed.inject(Router),
    dirtyForms: TestBed.inject(DirtyForms),
    running: TestBed.inject(RunningWork),
    offline,
    versions,
    unrecoverable,
    loadFromServer,
    claim,
    report,
    checkForUpdate,
    keep,
  };
}

function press(): void {
  window.dispatchEvent(new Event('pointerdown'));
}

function shown(visibility: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibility });
  document.dispatchEvent(new Event('visibilitychange'));
}

function serverSpeaks(generation: number): void {
  TestBed.inject(ServerVersion).observe(
    new HttpHeaders({ 'Cache-Control': 'no-store', 'Nfnn-Api': String(generation) }),
  );
  TestBed.tick();
}

function openDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.appendChild(dialog);
  return dialog;
}

function playingVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  document.body.appendChild(video);
  return video;
}

afterEach(() => {
  sessionStorage.removeItem(UPDATED_FOR_KEY);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  document.querySelectorAll('dialog, video').forEach((element) => element.remove());
});

describe('Given the app just started with its service worker', () => {
  afterEach(() => vi.useRealTimers());

  it('when a new version is ready before the visitor did anything, then the page reloads into it at once', () => {
    const { versions, loadFromServer, claim, keep } = setUp();

    versions.next({ type: 'ready' });

    expect(claim).toHaveBeenCalledWith('update');
    expect(keep).toHaveBeenCalledWith('/');
    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  it('when a new version is ready before the visitor did anything but a dialog is open, then nothing reloads on the page', () => {
    const { versions, loadFromServer } = setUp();
    openDialog();

    versions.next({ type: 'ready' });

    expect(loadFromServer).not.toHaveBeenCalled();
  });

  it('when a new version is ready before the visitor did anything but the app is offline, then nothing reloads on the page', () => {
    const { versions, loadFromServer, offline } = setUp();
    offline.set(true);

    versions.next({ type: 'ready' });

    expect(loadFromServer).not.toHaveBeenCalled();
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

  it('when the visitor reads on, puts the app into the background and comes back, then nothing reloads, because whatever they went to another app for stays', () => {
    window.dispatchEvent(new Event('scroll'));
    shown('hidden');
    shown('visible');

    expect(setup.loadFromServer).not.toHaveBeenCalled();
  });

  const blockers: readonly [string, (setup: Setup) => void][] = [
    ['a half-typed form', ({ dirtyForms }) => dirtyForms.register(() => true)],
    ['a write on its way', ({ running }) => running.start()],
    ['an open dialog', () => openDialog()],
    ['the camera or a video playing', () => playingVideo()],
    ['no connection', ({ offline }) => offline.set(true)],
  ];
  for (const [blocker, block] of blockers) {
    it(`when the visitor opens another page while a reload would break something (${blocker}), then the page opens in the app`, async () => {
      block(setup);

      await setup.router.navigateByUrl('/kontakt');

      expect(setup.loadFromServer).not.toHaveBeenCalled();
    });
  }

  describe('when a write is still on its way as the visitor opens another page', () => {
    it('then the page opens in the app, and the new version loads at the next page once the write is done', async () => {
      const end = setup.running.start();
      await setup.router.navigateByUrl('/kontakt');

      expect(setup.loadFromServer).not.toHaveBeenCalled();

      end();
      await setup.router.navigateByUrl('/aktuality');

      expect(setup.loadFromServer).toHaveBeenCalledWith('/aktuality');
    });
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
    const { unrecoverable, loadFromServer, report, claim, keep } = setUp();
    press();

    unrecoverable.next('Hash mismatch');
    TestBed.tick();

    expect(report).toHaveBeenCalledWith('sw-unrecoverable', 'service-worker');
    expect(claim).toHaveBeenCalledWith('unrecoverable');
    expect(keep).toHaveBeenCalledWith('/');
    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  it('when a form is half-typed, then nothing reloads until the form is gone, and then the page reloads by itself', () => {
    const { unrecoverable, loadFromServer, dirtyForms } = setUp();
    const unregister = dirtyForms.register(() => true);

    unrecoverable.next('Hash mismatch');
    TestBed.tick();

    expect(loadFromServer).not.toHaveBeenCalled();

    unregister();
    TestBed.tick();

    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  it('when the reload guard refuses, then the page stays', () => {
    const { unrecoverable, claim, loadFromServer } = setUp();
    claim.mockReturnValue(false);

    unrecoverable.next('Hash mismatch');
    TestBed.tick();

    expect(loadFromServer).not.toHaveBeenCalled();
  });
});

describe('Given the server speaks another API generation than the app', () => {
  afterEach(() => vi.useRealTimers());

  it('when no service worker runs and nothing would break, then the page loads again at once at the same address', () => {
    const { loadFromServer, claim, keep } = setUp(false);
    history.replaceState(null, '', '/aktuality');
    press();

    serverSpeaks(API_GENERATION + 1);

    expect(claim).toHaveBeenCalledWith('update');
    expect(keep).toHaveBeenCalledWith('/aktuality');
    expect(loadFromServer).toHaveBeenCalledWith('/aktuality');
  });

  it('when the server speaks the app generation, then nothing reloads', () => {
    const { loadFromServer } = setUp(false);

    serverSpeaks(API_GENERATION);

    expect(loadFromServer).not.toHaveBeenCalled();
  });

  it('when the service worker runs, then it fetches the new version first and loads the page after', async () => {
    const { loadFromServer, checkForUpdate } = setUp();
    let found: (value: boolean) => void = () => undefined;
    checkForUpdate.mockReturnValue(new Promise<boolean>((resolve) => (found = resolve)));
    press();

    serverSpeaks(API_GENERATION + 1);
    await Promise.resolve();

    expect(loadFromServer).not.toHaveBeenCalled();

    found(true);

    await vi.waitFor(() => expect(loadFromServer).toHaveBeenCalledWith('/'));
  });

  it('when the visitor starts typing while the service worker fetches the new version, then nothing reloads', async () => {
    const { loadFromServer, checkForUpdate, dirtyForms } = setUp();
    let found: (value: boolean) => void = () => undefined;
    checkForUpdate.mockReturnValue(new Promise<boolean>((resolve) => (found = resolve)));

    serverSpeaks(API_GENERATION + 1);
    dirtyForms.register(() => true);
    found(true);
    await new Promise((settled) => setTimeout(settled));

    expect(loadFromServer).not.toHaveBeenCalled();
  });

  for (const [outcome, answer] of [
    ['hangs past the time limit', () => new Promise<boolean>(() => undefined)],
    ['finds no new version', () => Promise.resolve(false)],
    ['fails', () => Promise.reject(new Error('offline'))],
  ] as const) {
    it(`when the service worker's check for the new version ${outcome}, then nothing reloads, because the page would load the same version again`, async () => {
      vi.useFakeTimers();
      const { loadFromServer, checkForUpdate } = setUp();
      checkForUpdate.mockImplementation(answer);

      serverSpeaks(API_GENERATION + 1);
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_TIMEOUT_MS);

      expect(loadFromServer).not.toHaveBeenCalled();
    });
  }

  it('when the service worker gets the new version ready later, then the page loads it then', () => {
    const { loadFromServer, checkForUpdate, versions } = setUp();
    checkForUpdate.mockReturnValue(Promise.resolve(false));
    press();
    serverSpeaks(API_GENERATION + 1);

    versions.next({ type: 'ready' });
    TestBed.tick();

    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  describe('when the app has already loaded again for that generation in this tab', () => {
    beforeEach(() => {
      setUp(false);
      serverSpeaks(API_GENERATION + 1);
      TestBed.resetTestingModule();
    });

    it('and the server still speaks it, then nothing reloads again, so a server that lags behind never makes the page reload over and over', () => {
      const { loadFromServer } = setUp(false);

      serverSpeaks(API_GENERATION + 1);

      expect(loadFromServer).not.toHaveBeenCalled();
    });

    it('and the server moves on to yet another generation, then the page loads again for it', () => {
      const { loadFromServer } = setUp(false);

      serverSpeaks(API_GENERATION + 2);

      expect(loadFromServer).toHaveBeenCalledWith('/');
    });
  });

  for (const moment of ['submit', 'reset']) {
    it(`when a form stops being half-typed and the page sees a ${moment}, then the page loads by itself`, async () => {
      const { loadFromServer, dirtyForms } = setUp(false);
      let dirty = true;
      dirtyForms.register(() => dirty);
      serverSpeaks(API_GENERATION + 1);
      dirty = false;

      document.body.dispatchEvent(new Event(moment, { bubbles: true }));
      await new Promise((settled) => setTimeout(settled));

      expect(loadFromServer).toHaveBeenCalledWith('/');
    });
  }

  it('when a video that held the reload stops, then the page loads by itself', async () => {
    const { loadFromServer } = setUp(false);
    const video = playingVideo();
    serverSpeaks(API_GENERATION + 1);

    expect(loadFromServer).not.toHaveBeenCalled();

    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    video.dispatchEvent(new Event('pause'));
    await new Promise((settled) => setTimeout(settled));

    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  it('when the service worker already holds the new version, then the page loads it at once', () => {
    const { loadFromServer, checkForUpdate, versions } = setUp();
    press();
    versions.next({ type: 'ready' });

    serverSpeaks(API_GENERATION + 1);

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  const waits: readonly [string, (setup: Setup) => () => void][] = [
    [
      'a form is half-typed',
      ({ dirtyForms }) => {
        let dirty = true;
        const unregister = dirtyForms.register(() => dirty);
        return () => {
          dirty = false;
          unregister();
        };
      },
    ],
    ['a write is on its way', ({ running }) => running.start()],
    [
      'the app is offline',
      ({ offline }) => {
        offline.set(true);
        return () => offline.set(false);
      },
    ],
  ];
  for (const [wait, begin] of waits) {
    it(`when ${wait}, then nothing reloads until that is over, and then the page loads by itself`, () => {
      const setup = setUp(false);
      const end = begin(setup);

      serverSpeaks(API_GENERATION + 1);

      expect(setup.loadFromServer).not.toHaveBeenCalled();

      end();
      TestBed.tick();

      expect(setup.loadFromServer).toHaveBeenCalledWith('/');
    });
  }

  it('when a dialog closes after holding the reload, then the page loads by itself', async () => {
    const { loadFromServer } = setUp(false);
    const dialog = openDialog();
    serverSpeaks(API_GENERATION + 1);

    expect(loadFromServer).not.toHaveBeenCalled();

    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    await new Promise((settled) => setTimeout(settled));

    expect(loadFromServer).toHaveBeenCalledWith('/');
  });

  it('when the reload guard refuses, then the page stays and loads again only when the visitor opens another page', async () => {
    const { loadFromServer, claim, router } = setUp(false);
    claim.mockReturnValue(false);

    serverSpeaks(API_GENERATION + 1);

    expect(loadFromServer).not.toHaveBeenCalled();

    claim.mockReturnValue(true);
    await router.navigateByUrl('/kontakt');

    expect(loadFromServer).toHaveBeenCalledWith('/kontakt');
  });
});

describe('Given the browser brings the page back from its memory of pages', () => {
  it('when the page shows again, then the service worker looks for a new version', () => {
    const { checkForUpdate } = setUp();

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('when the page shows for the first time, then nothing more is looked for', () => {
    const { checkForUpdate } = setUp();

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));

    expect(checkForUpdate).not.toHaveBeenCalled();
  });
});

describe('Given someone asks for the new version', () => {
  afterEach(() => vi.useRealTimers());

  it('when no service worker runs, then the page loads from the server at once, keeping the place first', () => {
    const { updates, loadFromServer, checkForUpdate, keep } = setUp(false);

    updates.loadNewVersion('/darce/prehled');

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(keep).toHaveBeenCalledWith('/darce/prehled');
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
