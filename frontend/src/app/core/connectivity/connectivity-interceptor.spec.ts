import {
  HttpClient,
  HttpEventType,
  HttpHeaderResponse,
  HttpHeaders,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { Connectivity, OFFLINE_AFTER_MS, PROBE_PATH } from './connectivity';
import { connectivityInterceptor } from './connectivity-interceptor';
import { ShownAnswers } from './shown-answers';

@Component({ template: '' })
class Page {}

const NOW = Date.UTC(2026, 10, 5, 11, 30);
const EARLIER = new Date(NOW - 3 * 60 * 60_000);

describe('Given the connectivity interceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let connectivity: Connectivity;
  let shown: ShownAnswers;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'aktuality', component: Page },
        ]),
        provideHttpClient(withInterceptors([connectivityInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    connectivity = TestBed.inject(Connectivity);
    shown = TestBed.inject(ShownAnswers);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function publicAnswer(url: string, date: Date): void {
    client.get(url).subscribe();
    http.expectOne(url).flush({}, { headers: { Date: date.toUTCString() } });
    http.match(PROBE_PATH).forEach((probe) => probe.flush({}));
  }

  it('when a public answer arrives, then the page knows when the server wrote it', () => {
    publicAnswer('/api/content/home', EARLIER);

    expect(shown.oldest()).toBe(EARLIER.getTime());
    expect(shown.fetchedAtOf('/api/content/home')).toBe(EARLIER.getTime());
  });

  it('when a page shows several public answers, then the oldest one is the time of its data', () => {
    publicAnswer('/api/content/home', new Date(NOW - 60_000));
    publicAnswer('/api/donations/payment-details', EARLIER);

    expect(shown.oldest()).toBe(EARLIER.getTime());
  });

  it('when an answer only for the signed-in donor arrives, then it is no public data of the page', () => {
    client.get('/api/donors/me').subscribe();
    http.expectOne('/api/donors/me').flush({}, { headers: { Date: EARLIER.toUTCString() } });

    expect(shown.oldest()).toBeNull();
  });

  it('when the visitor moves to another page, then the previous page’s answers are forgotten, while a jump within the page keeps them', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    publicAnswer('/api/content/home', EARLIER);

    await router.navigateByUrl('/#prispet');
    expect(shown.oldest()).toBe(EARLIER.getTime());

    await router.navigateByUrl('/aktuality');
    expect(shown.oldest()).toBeNull();
  });

  it('when the live stream opens and later breaks off, then the break after its headers still counts as a lost connection', () => {
    client
      .get('/api/live', { observe: 'events', reportProgress: true, responseType: 'text' })
      .subscribe({ error: () => undefined });
    const stream = http.expectOne('/api/live');
    stream.event(new HttpHeaderResponse({ status: 200, headers: new HttpHeaders({}) }));
    stream.event({ type: HttpEventType.DownloadProgress, partialText: 'event:', loaded: 6 });
    stream.error(new ProgressEvent('error'), { status: 0, statusText: '' });

    http.expectOne(PROBE_PATH).error(new ProgressEvent('error'), { status: 0, statusText: '' });
    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.offline()).toBe(true);
  });

  it('when a stream sends its headers, then that alone is contact', () => {
    client
      .get('/api/live', { observe: 'events', reportProgress: true, responseType: 'text' })
      .subscribe({ error: () => undefined });
    client.get('/api/donors/me').subscribe({ error: () => undefined });
    http
      .expectOne('/api/donors/me')
      .error(new ProgressEvent('error'), { status: 0, statusText: '' });
    const probe = http.expectOne(PROBE_PATH);

    http.expectOne('/api/live').event(new HttpHeaderResponse({ status: 200 }));
    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.offline()).toBe(false);
    probe.flush({});
  });
});
