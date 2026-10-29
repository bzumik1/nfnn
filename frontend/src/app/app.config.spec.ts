import { HttpBackend, HttpXhrBackend } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { appHttpClient, chunkLoadRecoveryFeature } from './app.config';
import { ExternalNavigation } from './core/navigation/external-navigation';
import { ReloadGuard } from './core/reload/reload-guard';

describe('Given the HTTP client of the app', () => {
  it('when a request is sent, then it goes through XMLHttpRequest, which reports upload progress', () => {
    TestBed.configureTestingModule({ providers: [appHttpClient] });

    expect(TestBed.inject(HttpBackend)).toBeInstanceOf(HttpXhrBackend);
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
      ],
    });
  });

  it('when the chunk of a lazy page cannot be loaded, then the page is loaded again from the server', async () => {
    await TestBed.inject(Router)
      .navigateByUrl('/aktuality')
      .catch(() => false);

    expect(loadFromServer).toHaveBeenCalledExactlyOnceWith('/aktuality');
  });
});
