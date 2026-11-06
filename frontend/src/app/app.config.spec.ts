import { HttpBackend, HttpClient, HttpXhrBackend } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { REMOVE_STYLES_ON_COMPONENT_DESTROY } from '@angular/platform-browser';
import { provideRouter, Router, RouterPreloader } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  appConfig,
  appErrorHandler,
  appHttpClient,
  chunkLoadRecoveryFeature,
  connectivityAtStart,
  dialogHistoryAtStart,
  keptPageStyles,
  navigationAtStart,
  tabPagesPreloading,
} from './app.config';
import { Connectivity } from './core/connectivity/connectivity';
import { ShownAnswers } from './core/connectivity/shown-answers';
import { DeviceStatusRetry } from './core/device/status/device-status-retry';
import { UnseenPhotos } from './core/connectivity/unseen-photos';
import { BackTarget } from './core/navigation/back-target';
import { pageTransitionsAtStart } from './core/navigation/page-transitions';
import { LOADED_AHEAD } from './core/navigation/tab-preloading';
import { TabMemory } from './core/navigation/tab-memory';
import { ReportingErrorHandler } from './core/errors/reporting-error-handler';
import { ExternalNavigation } from './core/navigation/external-navigation';
import { ChunkProbe } from './core/reload/chunk-probe';
import { ReloadGuard } from './core/reload/reload-guard';
import { DialogHistory } from './shared/ui/dialog/dialog-history';

describe('Given the HTTP client of the app', () => {
  it('when a request is sent, then it goes through XMLHttpRequest, which reports upload progress', () => {
    TestBed.configureTestingModule({ providers: [appHttpClient] });

    expect(TestBed.inject(HttpBackend)).toBeInstanceOf(HttpXhrBackend);
  });
});

describe('Given the public content the app has already shown', () => {
  it('when a page asks for it again, then the app answers from memory at once and asks the server in the background', async () => {
    TestBed.configureTestingModule({ providers: [appHttpClient, provideHttpClientTesting()] });
    const http = TestBed.inject(HttpClient);
    const backend = TestBed.inject(HttpTestingController);
    const first = firstValueFrom(http.get('/api/content/home'));
    backend.expectOne('/api/content/home').flush({ news: [] });
    await first;

    expect(await firstValueFrom(http.get('/api/content/home'))).toEqual({ news: [] });

    backend.expectOne('/api/content/home').flush({ news: [] });
    backend.verify();
  });

  it('when a visitor comes back to a page, then it shows the date of the kept answer until the answer from the background replaces it', async () => {
    @Component({ template: '' })
    class AnyPage {}
    TestBed.configureTestingModule({
      providers: [
        appHttpClient,
        provideHttpClientTesting(),
        provideRouter([{ path: '**', component: AnyPage }]),
      ],
    });
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpClient);
    const backend = TestBed.inject(HttpTestingController);
    const shown = TestBed.inject(ShownAnswers);
    const news = '/api/content/news?page=0&size=10';
    const keptAt = 'Thu, 05 Nov 2026 12:00:00 GMT';
    const refreshedAt = 'Thu, 05 Nov 2026 12:05:00 GMT';
    await router.navigateByUrl('/aktuality');
    const first = firstValueFrom(http.get(news));
    backend.expectOne(news).flush({ items: [] }, { headers: { Date: keptAt } });
    await first;
    await router.navigateByUrl('/o-nas');
    await router.navigateByUrl('/aktuality');

    await firstValueFrom(http.get(news));

    expect(shown.fetchedAtOf(news)).toBe(Date.parse(keptAt));
    backend.expectOne(news).flush({ items: [] }, { headers: { Date: refreshedAt } });
    expect(shown.fetchedAtOf(news)).toBe(Date.parse(refreshedAt));
  });
});

describe('Given the pages behind the tab bar', () => {
  @Component({ template: '' })
  class Landing {}

  it('when the app has shown its first page, then the tab pages load ahead and every other page waits', async () => {
    const tabPage = vi.fn(() => Promise.resolve(Landing));
    const otherPage = vi.fn(() => Promise.resolve(Landing));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: '', pathMatch: 'full', component: Landing },
            { path: 'aktuality', data: LOADED_AHEAD, loadComponent: tabPage },
            { path: 'zasady-ochrany-osobnich-udaju', loadComponent: otherPage },
          ],
          tabPagesPreloading,
        ),
      ],
    });

    await TestBed.inject(Router).navigateByUrl('/');
    await firstValueFrom(TestBed.inject(RouterPreloader).preload());

    expect(tabPage).toHaveBeenCalledTimes(1);
    expect(otherPage).not.toHaveBeenCalled();
  });
});

describe('Given the error handler of the app', () => {
  it('when an error escapes, then the handler that reports it to the server takes it', () => {
    TestBed.configureTestingModule({ providers: [appErrorHandler] });

    expect(TestBed.inject(ErrorHandler)).toBeInstanceOf(ReportingErrorHandler);
  });

  it('when the app starts, then its providers install that handler', () => {
    expect(appConfig.providers).toContain(appErrorHandler);
  });
});

describe('Given the history entries of dialogs', () => {
  it('when the app starts, then they are looked after before the first page opens, so a dialog left open by a reload costs no Back press', () => {
    const started = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        dialogHistoryAtStart,
        { provide: DialogHistory, useFactory: () => started() ?? {} },
      ],
    });

    TestBed.inject(Router);

    expect(started).toHaveBeenCalledTimes(1);
    expect(appConfig.providers).toContain(dialogHistoryAtStart);
  });
});

describe('Given the transitions between pages', () => {
  it('when the app starts, then the styles of a page that closes stay, so its still copy keeps its look while it slides', () => {
    TestBed.configureTestingModule({ providers: [keptPageStyles] });

    expect(TestBed.inject(REMOVE_STYLES_ON_COMPONENT_DESTROY)).toBe(false);
    expect(appConfig.providers).toContain(keptPageStyles);
  });

  it('when the app starts, then the transitions follow its navigations', () => {
    expect(appConfig.providers).toContain(pageTransitionsAtStart);
  });
});

describe('Given the connectivity of the app', () => {
  function startApp() {
    const started = vi.fn();
    const watchingPhotos = vi.fn();
    const retrying = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        connectivityAtStart,
        { provide: Connectivity, useFactory: () => started() ?? {} },
        { provide: UnseenPhotos, useFactory: () => watchingPhotos() ?? {} },
        { provide: DeviceStatusRetry, useValue: { start: retrying } },
      ],
    });
    TestBed.inject(Router);
    return { started, watchingPhotos, retrying };
  }

  it('when the app starts, then it listens to the browser from the first moment, so a start without a network is noticed before any page asks the server, and a photo it cannot load is marked from the first page', () => {
    const { started, watchingPhotos } = startApp();

    expect(started).toHaveBeenCalledTimes(1);
    expect(watchingPhotos).toHaveBeenCalledTimes(1);
    expect(appConfig.providers).toContain(connectivityAtStart);
  });

  it('when the app starts, then a device asks its status again when the connection returns', () => {
    const { retrying } = startApp();

    expect(retrying).toHaveBeenCalledTimes(1);
  });
});

describe('Given the way back and the memory of the tabs', () => {
  it('when the app starts, then they follow the navigation from the first page on, so a deep link knows it has nothing to go back to', () => {
    const backTarget = vi.fn();
    const tabMemory = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        navigationAtStart,
        { provide: BackTarget, useFactory: () => backTarget() ?? {} },
        { provide: TabMemory, useFactory: () => tabMemory() ?? {} },
      ],
    });

    TestBed.inject(Router);

    expect(backTarget).toHaveBeenCalledTimes(1);
    expect(tabMemory).toHaveBeenCalledTimes(1);
    expect(appConfig.providers).toContain(navigationAtStart);
  });
});

describe('Given the router of the app', () => {
  let loadFromServer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loadFromServer = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            {
              path: 'aktuality',
              loadComponent: () =>
                Promise.reject(
                  new TypeError(
                    'Failed to fetch dynamically imported module: http://localhost/chunk-AbCd_12-.js',
                  ),
                ),
            },
          ],
          chunkLoadRecoveryFeature,
        ),
        { provide: ReloadGuard, useValue: { claim: () => true } },
        { provide: ExternalNavigation, useValue: { loadFromServer } },
        { provide: ChunkProbe, useValue: { reloadWouldLand: () => Promise.resolve(true) } },
      ],
    });
  });

  it('when the chunk of a lazy page cannot be loaded, then the page is loaded again from the server', async () => {
    await TestBed.inject(Router)
      .navigateByUrl('/aktuality')
      .catch(() => false);

    await vi.waitFor(() => expect(loadFromServer).toHaveBeenCalledExactlyOnceWith('/aktuality'));
  });
});
