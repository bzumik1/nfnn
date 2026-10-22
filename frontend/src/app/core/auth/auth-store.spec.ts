import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore, SESSION_HINT_KEY } from './auth-store';
import { Donor } from './donor';
import { authResponse, problem } from './testing/donor-fixtures';

describe('Given the auth store', () => {
  let store: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function signIn(token = 'token-1'): void {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse(token));
  }

  it('when a donor signs in, then the profile and the access token are kept and a session hint is remembered', () => {
    let signedIn: Donor | undefined;
    store
      .login('jana@example.cz', 'correct horse battery')
      .subscribe((donor) => (signedIn = donor));

    const request = http.expectOne('/api/donors/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      email: 'jana@example.cz',
      password: 'correct horse battery',
    });
    request.flush(authResponse('token-1'));

    expect(signedIn?.name).toBe('Jana Nováková');
    expect(store.donor()?.variableSymbol).toBe('1234567890');
    expect(store.signedIn()).toBe(true);
    expect(store.status()).toBe('signed-in');
    expect(store.currentAccessToken()).toBe('token-1');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('when a donor registers, then the request carries the whole registration and the donor is signed in', () => {
    store
      .register({
        type: 'COMPANY',
        name: 'Stavby Novák s.r.o.',
        companyIdentifier: '45274649',
        address: { street: 'Průmyslová 5', city: 'Teplice', postalCode: '415 01' },
        email: 'ucetni@stavby.cz',
        password: 'correct horse battery',
        preferredLocale: 'cs',
      })
      .subscribe();

    const request = http.expectOne('/api/donors/auth/register');
    expect(request.request.body.type).toBe('COMPANY');
    expect(request.request.body.companyIdentifier).toBe('45274649');
    request.flush(authResponse('token-1'), { status: 201, statusText: 'Created' });

    expect(store.signedIn()).toBe(true);
  });

  it('when the session is restored with a hint present, then the session is refreshed and the donor is signed in', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const restored = store.restore();
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2'));
    await restored;

    expect(store.donor()?.email).toBe('jana@example.cz');
    expect(store.currentAccessToken()).toBe('token-2');
  });

  it('when the session is restored without a hint, then nothing is requested and the visitor is anonymous', async () => {
    await store.restore();

    http.expectNone('/api/donors/auth/refresh');
    expect(store.status()).toBe('anonymous');
    expect(store.signedIn()).toBe(false);
  });

  it('when the refresh is refused, then the visitor is anonymous and the hint is dropped', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const restored = store.restore();
    http
      .expectOne('/api/donors/auth/refresh')
      .flush(problem('auth/invalid-refresh-token'), { status: 401, statusText: 'Unauthorized' });
    await restored;

    expect(store.status()).toBe('anonymous');
    expect(store.donor()).toBeNull();
    expect(store.currentAccessToken()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('when two refreshes overlap, then only one request is sent and both get the new token', () => {
    const tokens: string[] = [];
    store.refresh().subscribe((token) => tokens.push(token));
    store.refresh().subscribe((token) => tokens.push(token));

    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-3'));

    expect(tokens).toEqual(['token-3', 'token-3']);
    expect(store.currentAccessToken()).toBe('token-3');
  });

  it('when the donor signs out, then the session is forgotten even if the server fails', () => {
    signIn();

    store.logout().subscribe();
    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(store.donor()).toBeNull();
    expect(store.currentAccessToken()).toBeNull();
    expect(store.status()).toBe('anonymous');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('when the profile is updated, then the store shows the new profile', () => {
    signIn();

    store.updateProfile({ name: 'Jana Svobodová' }).subscribe();
    const request = http.expectOne('/api/donors/me');
    expect(request.request.method).toBe('PATCH');
    request.flush({ ...authResponse('token-1').user, name: 'Jana Svobodová' });

    expect(store.donor()?.name).toBe('Jana Svobodová');
  });
});
