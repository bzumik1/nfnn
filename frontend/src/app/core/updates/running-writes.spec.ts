import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RunningWork } from './running-work';
import { runningWritesInterceptor } from './running-writes';

describe('Given the interceptor that counts the writes on their way', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let work: RunningWork;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([runningWritesInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    work = TestBed.inject(RunningWork);
  });

  afterEach(() => http.verify());

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`when the app sends a ${method} to the API, then work runs until the answer comes`, () => {
      client.request(method, '/api/contact/messages', { body: {} }).subscribe();

      expect(work.any()).toBe(true);

      http.expectOne('/api/contact/messages').flush(null, { status: 202, statusText: 'Accepted' });

      expect(work.any()).toBe(false);
    });
  }

  it('when a write fails, then nothing runs any more', () => {
    client.post('/api/contact/messages', {}).subscribe({ error: () => undefined });

    http
      .expectOne('/api/contact/messages')
      .flush(null, { status: 500, statusText: 'Internal Server Error' });

    expect(work.any()).toBe(false);
  });

  it('when the page gives up on a write before its answer, then nothing runs any more', () => {
    const subscription = client.post('/api/contact/messages', {}).subscribe();

    subscription.unsubscribe();

    expect(http.expectOne('/api/contact/messages').cancelled).toBe(true);
    expect(work.any()).toBe(false);
  });

  it('when the app reads from the API, then no work runs for it', () => {
    client.get('/api/content/home').subscribe();

    expect(work.any()).toBe(false);

    http.expectOne('/api/content/home').flush({});
  });

  it('when the app sends something to an address outside the API, then no work runs for it', () => {
    client.post('/mcp', {}).subscribe();

    expect(work.any()).toBe(false);

    http.expectOne('/mcp').flush({});
  });
});
