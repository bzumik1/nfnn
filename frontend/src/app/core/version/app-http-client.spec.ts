import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { appHttpClient } from '../../app.config';
import { AuthStore } from '../auth/auth-store';
import { authResponse, problem, sampleDonor } from '../auth/testing/donor-fixtures';
import { APP_REVISION } from '../errors/app-revision';
import { API_GENERATION } from './api-generation';
import { ServerVersion } from './server-version';
import { Connectivity, OFFLINE_AFTER_MS, PROBE_PATH } from '../connectivity/connectivity';
import { AdministrationWrites } from '../admin-writes/administration-writes';
import { ifMatch } from './row-version';

describe("Given the app's HTTP client", () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [appHttpClient, provideHttpClientTesting()] });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when an expired token is refreshed and the call retried, then the refresh and the retried call name the app and both answers tell the server version', () => {
    const store = TestBed.inject(AuthStore);
    const version = TestBed.inject(ServerVersion);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));

    client.get('/api/donors/me').subscribe();
    http
      .expectOne('/api/donors/me')
      .flush(problem('auth/expired-token'), { status: 401, statusText: 'Unauthorized' });
    const refresh = http.expectOne('/api/donors/auth/refresh');
    expect(refresh.request.headers.get('Nfnn-App')).toBe(APP_REVISION);
    refresh.flush(authResponse('token-2'), {
      headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': String(API_GENERATION + 1) },
    });
    expect(version.mustUpdate()).toBe(true);

    const retried = http.expectOne('/api/donors/me');
    expect(retried.request.headers.get('Nfnn-App')).toBe(APP_REVISION);
    expect(retried.request.headers.get('Authorization')).toBe('Bearer token-2');
    retried.flush(sampleDonor(), {
      headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': String(API_GENERATION) },
    });
    expect(version.mustUpdate()).toBe(false);
  });

  it('when a donor call is refreshed and retried, then the call, the refresh and the retry all go past the service worker', () => {
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    const login = http.expectOne('/api/donors/auth/login');
    expect(login.request.headers.get('ngsw-bypass')).toBe('true');
    login.flush(authResponse('token-1'));

    client.get('/api/donors/me').subscribe();
    const first = http.expectOne('/api/donors/me');
    expect(first.request.headers.get('ngsw-bypass')).toBe('true');
    first.flush(problem('auth/expired-token'), { status: 401, statusText: 'Unauthorized' });
    const refresh = http.expectOne('/api/donors/auth/refresh');
    expect(refresh.request.headers.get('ngsw-bypass')).toBe('true');
    refresh.flush(authResponse('token-2'));

    const retried = http.expectOne('/api/donors/me');
    expect(retried.request.headers.get('ngsw-bypass')).toBe('true');
    retried.flush(sampleDonor());
  });

  it('when a versioned write is refused only because the version moved, then the app sends it once more with the refusal version and the refreshed token', () => {
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
    const held = { text: 'Děkujeme.' };
    let answer: unknown;

    client
      .put('/api/admin/content/people/note', held, ifMatch('0000000000000001', held))
      .subscribe((value) => (answer = value));
    http
      .expectOne('/api/admin/content/people/note')
      .flush(problem('auth/expired-token'), { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2'));
    http.expectOne('/api/admin/content/people/note').flush(
      {
        type: 'https://nfnn.cz/problems/content/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        status: 409,
        version: '00000000000000ff',
        current: { text: 'Děkujeme.', updatedAt: '2026-11-12T08:00:00Z' },
      },
      { status: 409, statusText: 'Conflict' },
    );

    const resent = http.expectOne('/api/admin/content/people/note');
    expect(resent.request.headers.get('If-Match')).toBe('"00000000000000ff"');
    expect(resent.request.headers.get('Authorization')).toBe('Bearer token-2');
    resent.flush({ text: 'Děkujeme.', version: '0000000000000100' });

    expect(answer).toEqual({ text: 'Děkujeme.', version: '0000000000000100' });
    http.expectNone('/api/admin/content/people/note');
  });

  it('when a refused write comes from a server of a newer API generation, then it is not sent again and the app asks to be updated', () => {
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
    const held = { text: 'Děkujeme.' };
    let failure: { status?: number } | undefined;

    client
      .put('/api/admin/content/people/note', held, ifMatch('0000000000000001', held))
      .subscribe({ error: (refusal: { status?: number }) => (failure = refusal) });
    http.expectOne('/api/admin/content/people/note').flush(
      {
        type: 'https://nfnn.cz/problems/content/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        status: 409,
        version: '00000000000000ff',
        current: { text: 'Děkujeme.' },
      },
      {
        status: 409,
        statusText: 'Conflict',
        headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': String(API_GENERATION + 1) },
      },
    );

    http.expectNone('/api/admin/content/people/note');
    expect(failure?.status).toBe(426);
  });

  it('when an administration write succeeds, then the app counts it, so the pages read from the device copy wait for a refresh after it', () => {
    const writes = TestBed.inject(AdministrationWrites);
    const before = writes.made();

    client.post('/api/admin/donations/payments/p/pairing', {}).subscribe();
    http.expectOne('/api/admin/donations/payments/p/pairing').flush({});

    expect(writes.made()).toBe(before + 1);
  });

  it('when the app reads public news, then the service worker may answer it', () => {
    client.get('/api/content/news', { params: { page: 0, size: 6 } }).subscribe();

    const news = http.expectOne('/api/content/news?page=0&size=6');
    expect(news.request.headers.has('ngsw-bypass')).toBe(false);
    news.flush({ items: [], page: 0, size: 6, total: 0 });
  });

  it('when a call reaches nothing, then the app asks the server past the service worker and without the token, and is offline once that fails too', () => {
    vi.useFakeTimers();
    try {
      const connectivity = TestBed.inject(Connectivity);
      client.get('/api/donors/me').subscribe({ error: () => undefined });
      http
        .expectOne('/api/donors/me')
        .error(new ProgressEvent('error'), { status: 0, statusText: '' });
      const probe = http.expectOne(PROBE_PATH);
      expect(probe.request.headers.get('ngsw-bypass')).toBe('true');
      expect(probe.request.headers.has('Authorization')).toBe(false);
      probe.error(new ProgressEvent('error'), { status: 0, statusText: '' });

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
