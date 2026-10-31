import { HttpBackend, HttpXhrBackend } from '@angular/common/http';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { appConfig, appErrorHandler, appHttpClient, chunkLoadRecoveryFeature } from './app.config';
import { ReportingErrorHandler } from './core/errors/reporting-error-handler';
import { ExternalNavigation } from './core/navigation/external-navigation';
import { ChunkProbe } from './core/reload/chunk-probe';
import { ReloadGuard } from './core/reload/reload-guard';

describe('Given the HTTP client of the app', () => {
  it('when a request is sent, then it goes through XMLHttpRequest, which reports upload progress', () => {
    TestBed.configureTestingModule({ providers: [appHttpClient] });

    expect(TestBed.inject(HttpBackend)).toBeInstanceOf(HttpXhrBackend);
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
