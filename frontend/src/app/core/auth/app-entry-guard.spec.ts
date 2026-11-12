import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';

import { appEntryGuard } from './app-entry-guard';
import { SESSION_HINT_KEY } from './auth-store';
import { LoginDialogService } from './login-dialog.service';
import { copyProfileOf } from './copy-profile';
import { NO_SESSION_DEVICE, SESSION_DEVICE, type SessionDevice } from './session-device';
import { authResponse, sampleDonor } from './testing/donor-fixtures';

function offlineAdministrator(): SessionDevice {
  const administrator = sampleDonor({ roles: ['DONOR', 'ADMIN'] });
  return {
    ...NO_SESSION_DEVICE,
    openedOffline: async () => ({
      profile: copyProfileOf(administrator),
      session: { kind: 'REMEMBERED', acceptedAt: new Date().toISOString() },
    }),
  };
}

describe('Given the app opened from its icon on the home screen', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SESSION_DEVICE, useValue: offlineAdministrator() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function landing(): Promise<string> {
    const result = (await TestBed.runInInjectionContext(() =>
      appEntryGuard({} as ActivatedRouteSnapshot, { url: '/aplikace' } as RouterStateSnapshot),
    )) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    return TestBed.inject(Router).serializeUrl(result);
  }

  it('when nobody is signed in on this device, then it opens the home page without the sign-in dialog', async () => {
    expect(await landing()).toBe('/');
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(false);
  });

  it('when a donor has a session to restore, then it opens their overview', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const result = landing();
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-1', sampleDonor()));

    expect(await result).toBe('/darce/prehled');
  });

  it('when the account of an administrator shows from the device copy because the server cannot be reached, then it opens their overview', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const result = landing();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').error(new ProgressEvent('error'), { status: 0 }),
    );

    expect(await result).toBe('/darce/prehled');
    http
      .match(() => true)
      .forEach((request) => request.error(new ProgressEvent('error'), { status: 0 }));
  });

  it('when an administrator signed in with the second factor has a session to restore, then it opens the administration', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const result = landing();
    http
      .expectOne('/api/donors/auth/refresh')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));

    expect(await result).toBe('/sprava');
  });

  it('when the stored session has expired, then it opens the home page', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const result = landing();
    http
      .expectOne('/api/donors/auth/refresh')
      .flush(
        { type: 'https://nfnn.cz/problems/donors/invalid-refresh-token', status: 401 },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(await result).toBe('/');
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(false);
  });

  it('when a donor has a session to restore, then no sign-in dialog opens', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const result = landing();
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-1', sampleDonor()));
    await result;

    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(false);
  });
});
