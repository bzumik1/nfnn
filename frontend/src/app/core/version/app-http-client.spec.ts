import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { appHttpClient } from '../../app.config';
import { AuthStore } from '../auth/auth-store';
import { authResponse, problem, sampleDonor } from '../auth/testing/donor-fixtures';
import { APP_REVISION } from '../errors/app-revision';
import { API_GENERATION } from './api-generation';
import { ServerVersion } from './server-version';

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

  it('when the app reads public news, then the service worker may answer it', () => {
    client.get('/api/content/news', { params: { page: 0, size: 6 } }).subscribe();

    const news = http.expectOne('/api/content/news?page=0&size=6');
    expect(news.request.headers.has('ngsw-bypass')).toBe(false);
    news.flush({ items: [], page: 0, size: 6, total: 0 });
  });
});
