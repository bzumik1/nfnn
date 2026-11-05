import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { describeProblem, problemTypeEndsWith } from '../auth/api-problem';
import { APP_REVISION } from '../errors/app-revision';
import { NO_SERVICE_WORKER, SERVICE_WORKER_UPDATES } from '../updates/service-worker-updates';
import { API_GENERATION } from './api-generation';
import { ServerVersion } from './server-version';
import { UPDATE_REQUIRED, versionInterceptor } from './version-interceptor';

const NEWER = String(API_GENERATION + 1);

describe('Given the version interceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let version: ServerVersion;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([versionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    version = TestBed.inject(ServerVersion);
  });

  afterEach(() => http.verify());

  function serverAnswers(generation: string): void {
    client.get('/api/content/home').subscribe();
    http.expectOne('/api/content/home').flush(
      {},
      {
        headers: {
          'Cache-Control': 'no-store',
          'Nfnn-Api': generation,
          'Nfnn-Revision': '0123abc',
        },
      },
    );
  }

  it('when the app calls the API, then the call names the revision the app was built from', () => {
    client.get('/api/content/home').subscribe();

    const request = http.expectOne('/api/content/home');
    expect(request.request.headers.get('Nfnn-App')).toBe(APP_REVISION);
    request.flush({});
  });

  it('when the app calls the API, then the call names the API generation the app speaks, so the server can refuse a write the app sends before it learns of a new one', () => {
    client.post('/api/contact/messages', {}).subscribe();

    const request = http.expectOne('/api/contact/messages');
    expect(request.request.headers.get('Nfnn-App-Api')).toBe(String(API_GENERATION));
    request.flush({});
  });

  it('when the server refuses a write because the app speaks another generation, then the app learns the new generation and holds the next write', () => {
    let failure: unknown;
    client
      .post('/api/contact/messages', {})
      .subscribe({ error: (error: unknown) => (failure = error) });
    http.expectOne('/api/contact/messages').flush(
      {
        type: `https://nfnn.cz/problems/${UPDATE_REQUIRED}`,
        title: 'Web mezitím dostal novou verzi',
        detail: 'Nic jsme neodeslali. Načtěte stránku znovu a zkuste to ještě jednou.',
      },
      {
        status: 426,
        statusText: 'Upgrade Required',
        headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': NEWER },
      },
    );

    expect(problemTypeEndsWith(failure, UPDATE_REQUIRED)).toBe(true);
    expect(version.mustUpdate()).toBe(true);
    client.post('/api/contact/messages', {}).subscribe({ error: () => undefined });
    http.expectNone('/api/contact/messages');
  });

  it('when the app loads a file that is not the API, then the call names no revision', () => {
    client.get('/receipt-fonts/body.ttf').subscribe();

    const request = http.expectOne('/receipt-fonts/body.ttf');
    expect(request.request.headers.has('Nfnn-App')).toBe(false);
    request.flush('');
  });

  it('when an API answer names the server version, then the app learns it', () => {
    serverAnswers(String(API_GENERATION));

    expect(version.revision()).toBe('0123abc');
    expect(version.apiGeneration()).toBe(API_GENERATION);
    expect(version.mustUpdate()).toBe(false);
  });

  it('when an API refusal names a newer generation, then the app learns it from the refusal too', () => {
    client.get('/api/donors/me').subscribe({ error: () => undefined });
    http.expectOne('/api/donors/me').flush(
      { type: 'https://nfnn.cz/problems/auth/unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': NEWER },
      },
    );

    expect(version.mustUpdate()).toBe(true);
  });

  it('when a file outside the API names a version, then the app ignores it', () => {
    client.get('/receipt-fonts/body.ttf').subscribe();
    http
      .expectOne('/receipt-fonts/body.ttf')
      .flush('', { headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': NEWER } });

    expect(version.mustUpdate()).toBe(false);
  });

  describe('when the server speaks a newer API generation', () => {
    beforeEach(() => serverAnswers(NEWER));

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      it(`then a ${method} to the API is refused before it leaves the browser, with a line that says what to do`, () => {
        let failure: unknown;

        client
          .request(method, '/api/donors/me', { body: { name: 'Jana' } })
          .subscribe({ error: (error: unknown) => (failure = error) });

        http.expectNone('/api/donors/me');
        expect(failure).toBeInstanceOf(HttpErrorResponse);
        expect(problemTypeEndsWith(failure, UPDATE_REQUIRED)).toBe(true);
        expect(describeProblem(failure, 'Obecná chyba.')).toBe(
          'Web mezitím dostal novou verzi. Nic jsme neodeslali. Načtěte stránku znovu a zkuste to ještě jednou.',
        );
      });
    }

    it('then reading the API still works', () => {
      client.get('/api/donations/me/summary').subscribe();

      http.expectOne('/api/donations/me/summary').flush({});
    });

    for (const path of [
      '/api/donors/auth/refresh',
      '/api/donors/auth/logout',
      '/api/donations/receipts/status',
    ]) {
      it(`then keeping or ending the session or asking a receipt's status (${path}) still works`, () => {
        client.post(path, null).subscribe();

        http.expectOne(path).flush(null);
      });
    }
  });
});

describe('Given the version interceptor while the service worker controls the page', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let version: ServerVersion;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([versionInterceptor])),
        provideHttpClientTesting(),
        { provide: SERVICE_WORKER_UPDATES, useValue: { ...NO_SERVICE_WORKER, isEnabled: true } },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    version = TestBed.inject(ServerVersion);
  });

  afterEach(() => http.verify());

  it('when a public answer names another API generation, then the app keeps what it knows, because the worker may have kept that answer for weeks', () => {
    client.get('/api/content/news', { params: { page: 0, size: 6 } }).subscribe();
    http
      .expectOne('/api/content/news?page=0&size=6')
      .flush({}, { headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': NEWER } });

    expect(version.mustUpdate()).toBe(false);
  });

  it('when an answer the worker never keeps names another API generation, then the app learns it', () => {
    client.get('/api/donors/me').subscribe();
    http
      .expectOne('/api/donors/me')
      .flush({}, { headers: { 'Cache-Control': 'no-store', 'Nfnn-Api': NEWER } });

    expect(version.mustUpdate()).toBe(true);
  });
});
