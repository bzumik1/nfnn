import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { SESSION_HINT_KEY } from './auth-store';
import { donorGuard } from './donor-guard';
import { LoginDialogService } from './login-dialog.service';
import { authResponse, problem } from './testing/donor-fixtures';

describe('Given the donor area guard', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function activate(): Promise<boolean | UrlTree> {
    return TestBed.runInInjectionContext(() =>
      donorGuard({} as ActivatedRouteSnapshot, { url: '/donor/prehled' } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  }

  it('when the donor has a session to restore, then the donor area opens', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const result = activate();
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-1'));

    expect(await result).toBe(true);
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(false);
  });

  it('when nobody is signed in, then the visitor goes to the home page and the sign-in dialog opens', async () => {
    const result = await activate();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
  });

  it('when the session can no longer be refreshed, then the visitor goes to the home page as well', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const result = activate();
    http
      .expectOne('/api/donors/auth/refresh')
      .flush(problem('auth/invalid-refresh-token'), { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
  });
});
