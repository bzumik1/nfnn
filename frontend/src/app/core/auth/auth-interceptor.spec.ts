import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor, WITHOUT_ACCESS_TOKEN } from './auth-interceptor';
import { AuthStore } from './auth-store';
import { Donor } from './donor';
import { authResponse, problem, sampleDonor } from './testing/donor-fixtures';

describe('Given the auth interceptor', () => {
  let client: HttpClient;
  let store: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function signIn(token: string): void {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse(token));
  }

  it('when a donor is signed in, then API calls carry the access token', () => {
    signIn('token-1');

    client.get('/api/donors/me').subscribe();

    const request = http.expectOne('/api/donors/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    request.flush(sampleDonor());
  });

  it('when nobody is signed in, then API calls carry no token', () => {
    client.post('/api/contact/messages', {}).subscribe();

    const request = http.expectOne('/api/contact/messages');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('when a call is marked as one without the access token, then it carries none although a donor is signed in', () => {
    signIn('token-1');

    client
      .get('/api/donations/payment-details', {
        context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true),
      })
      .subscribe();

    const request = http.expectOne('/api/donations/payment-details');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('when a call without the access token is refused with a problem file, then the caller gets the problem as a parsed body and no refresh happens', async () => {
    signIn('token-1');
    let failure: unknown;
    client
      .get('/api/donations/payment-details', {
        context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true),
        responseType: 'blob',
      })
      .subscribe({ error: (error: unknown) => (failure = error) });

    http.expectOne('/api/donations/payment-details').flush(
      new Blob([JSON.stringify(problem('donations/rate-limited'))], {
        type: 'application/problem+json',
      }),
      { status: 429, statusText: 'Too Many Requests' },
    );
    await vi.waitFor(() => expect(failure).toBeInstanceOf(HttpErrorResponse));

    expect((failure as HttpErrorResponse).error).toEqual(problem('donations/rate-limited'));
    http.expectNone('/api/donors/auth/refresh');
    expect(store.currentAccessToken()).toBe('token-1');
  });

  it('when the access token expired, then the session is refreshed and the call is retried with the new token', () => {
    signIn('token-1');
    let received: Donor | undefined;
    client.get<Donor>('/api/donors/me').subscribe((donor) => (received = donor));

    http
      .expectOne('/api/donors/me')
      .flush(problem('auth/expired-token'), { status: 401, statusText: 'Unauthorized' });

    const refresh = http.expectOne('/api/donors/auth/refresh');
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(authResponse('token-2'));

    const retried = http.expectOne('/api/donors/me');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer token-2');
    retried.flush(sampleDonor());

    expect(received).toEqual(sampleDonor());
    expect(store.currentAccessToken()).toBe('token-2');
  });

  it('when the refresh is refused as well, then the failure reaches the caller and the session is forgotten', () => {
    signIn('token-1');
    let failure: unknown;
    client.get('/api/donors/me').subscribe({ error: (reason: unknown) => (failure = reason) });

    http
      .expectOne('/api/donors/me')
      .flush(problem('auth/expired-token'), { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne('/api/donors/auth/refresh')
      .flush(problem('auth/invalid-refresh-token'), { status: 401, statusText: 'Unauthorized' });

    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect((failure as HttpErrorResponse).status).toBe(401);
    expect(store.signedIn()).toBe(false);
  });

  it('when a 401 is not about an expired token, then it passes through without a refresh', () => {
    signIn('token-1');
    let failure: unknown;
    client.get('/api/donors/me').subscribe({ error: (reason: unknown) => (failure = reason) });

    http
      .expectOne('/api/donors/me')
      .flush(problem('auth/unauthenticated'), { status: 401, statusText: 'Unauthorized' });

    http.expectNone('/api/donors/auth/refresh');
    expect((failure as HttpErrorResponse).status).toBe(401);
    expect(store.currentAccessToken()).toBe('token-1');
  });

  function problemBlob(type: string, title = 'Problem'): Blob {
    return new Blob([JSON.stringify(problem(type, title))], { type: 'application/problem+json' });
  }

  async function blobSettled(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('when a file download fails with an expired token, then the session is refreshed and the download is retried with the new token', async () => {
    signIn('token-1');
    let received: Blob | undefined;
    client
      .get('/api/admin/operations/backups/nfnn-2026-10-31_03-00.dump.age', { responseType: 'blob' })
      .subscribe((file) => (received = file));

    http
      .expectOne('/api/admin/operations/backups/nfnn-2026-10-31_03-00.dump.age')
      .flush(problemBlob('auth/expired-token'), { status: 401, statusText: 'Unauthorized' });
    await blobSettled();

    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2'));
    const retried = http.expectOne('/api/admin/operations/backups/nfnn-2026-10-31_03-00.dump.age');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer token-2');
    retried.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));

    expect(await received?.text()).toBe('%PDF-1.4');
  });

  it('when a file download is refused as unauthenticated, then the caller gets the problem as a parsed body and no refresh happens', async () => {
    signIn('token-1');
    let failure: unknown;
    client
      .get('/api/admin/operations/backups/nfnn-2026-10-31_03-00.dump.age', { responseType: 'blob' })
      .subscribe({ error: (reason: unknown) => (failure = reason) });

    http
      .expectOne('/api/admin/operations/backups/nfnn-2026-10-31_03-00.dump.age')
      .flush(problemBlob('auth/unauthenticated', 'Přihlaste se'), {
        status: 401,
        statusText: 'Unauthorized',
      });
    await blobSettled();

    http.expectNone('/api/donors/auth/refresh');
    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect((failure as HttpErrorResponse).status).toBe(401);
    expect((failure as HttpErrorResponse).error).toEqual(
      problem('auth/unauthenticated', 'Přihlaste se'),
    );
  });

  it('when a file download fails with a blob that is not a problem, then the failure passes through unchanged', async () => {
    signIn('token-1');
    let failure: unknown;
    const body = new Blob(['Bad Gateway'], { type: 'text/html' });
    client
      .get('/api/admin/operations/backups/nfnn-2026-10-31_03-00.dump.age', { responseType: 'blob' })
      .subscribe({ error: (reason: unknown) => (failure = reason) });

    http
      .expectOne('/api/admin/operations/backups/nfnn-2026-10-31_03-00.dump.age')
      .flush(body, { status: 502, statusText: 'Bad Gateway' });
    await blobSettled();

    expect((failure as HttpErrorResponse).status).toBe(502);
    expect((failure as HttpErrorResponse).error).toBe(body);
  });
});
