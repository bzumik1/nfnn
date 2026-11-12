import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { serviceWorkerBypassInterceptor } from '../updates/service-worker-bypass';
import { Connectivity, PROBE_PATH } from './connectivity';
import { connectivityInterceptor } from './connectivity-interceptor';
import {
  keptAnswerRefreshInterceptor,
  OFFLINE_ANSWER_WAIT_MS,
  REFRESH_AFTER_KEPT_COPY,
  REFRESH_WAIT_MS,
} from './kept-answer-refresh';

const NEWS = '/api/content/news?page=0&size=10';
const NOW = Date.UTC(2026, 10, 6, 17, 30);
const MINUTES_AGO = new Date(NOW - 5 * 60_000).toUTCString();
const JUST_NOW = new Date(NOW - 2_000).toUTCString();

interface Received {
  readonly answers: unknown[];
  failed: boolean;
  failure: unknown;
  completed: boolean;
}

describe('Given the refresh of answers the service worker kept', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(
          withInterceptors([
            keptAnswerRefreshInterceptor,
            serviceWorkerBypassInterceptor,
            connectivityInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http
      .match(PROBE_PATH)
      .filter((probe) => !probe.cancelled)
      .forEach((probe) => probe.flush({}));
    http.verify();
    vi.useRealTimers();
  });

  function ask(url: string, refreshed = true): Received {
    const received: Received = { answers: [], failed: false, failure: null, completed: false };
    const context = new HttpContext().set(REFRESH_AFTER_KEPT_COPY, refreshed);
    client.get(url, { context }).subscribe({
      next: (answer) => received.answers.push(answer),
      error: (failure: unknown) => {
        received.failed = true;
        received.failure = failure;
      },
      complete: () => (received.completed = true),
    });
    return received;
  }

  function workerAnswers(url: string, body: object, date: string): void {
    const request = http.expectOne(
      (asked) => asked.urlWithParams === url && !asked.headers.has('ngsw-bypass'),
    );
    request.flush(body, { headers: { Date: date } });
  }

  function serverRefresh(url: string) {
    return http.expectOne(
      (asked) => asked.urlWithParams === url && asked.headers.get('ngsw-bypass') === 'true',
    );
  }

  describe('when the worker answers a public page from a copy minutes old', () => {
    it('then the page gets the copy at once and the server is asked past the worker', () => {
      const received = ask(NEWS);
      workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);

      expect(received.answers).toEqual([{ items: ['old'] }]);
      expect(received.completed).toBe(false);
      serverRefresh(NEWS).flush({ items: ['old'] }, { headers: { Date: JUST_NOW } });
    });

    it('and the server says something else, then the page gets the server answer next', () => {
      const received = ask(NEWS);
      workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);

      serverRefresh(NEWS).flush({ items: ['new', 'old'] }, { headers: { Date: JUST_NOW } });

      expect(received.answers).toEqual([{ items: ['old'] }, { items: ['new', 'old'] }]);
      expect(received.completed).toBe(true);
    });

    it('and the server says the same, then the page gets nothing more', () => {
      const received = ask(NEWS);
      workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);

      serverRefresh(NEWS).flush({ items: ['old'] }, { headers: { Date: JUST_NOW } });

      expect(received.answers).toEqual([{ items: ['old'] }]);
      expect(received.completed).toBe(true);
    });

    it('and the server cannot be reached, then the page keeps the copy and gets no error', () => {
      const received = ask(NEWS);
      workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);

      serverRefresh(NEWS).error(new ProgressEvent('error'), { status: 0, statusText: '' });

      expect(received.answers).toEqual([{ items: ['old'] }]);
      expect(received.failed).toBe(false);
      expect(received.completed).toBe(true);
    });

    it('and the server answers with a refusal, then the page keeps the copy and gets no error', () => {
      const received = ask(NEWS);
      workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);

      serverRefresh(NEWS).flush({}, { status: 404, statusText: 'Not Found' });

      expect(received.answers).toEqual([{ items: ['old'] }]);
      expect(received.failed).toBe(false);
    });
  });

  it('when a page did not ask for the refresh, then it gets the copy once and done, and nothing is asked past the worker', () => {
    const received = ask(NEWS, false);
    workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);

    expect(received.answers).toEqual([{ items: ['old'] }]);
    expect(received.completed).toBe(true);
    http.expectNone((asked) => asked.url !== PROBE_PATH && asked.headers.has('ngsw-bypass'));
  });

  it('when the server does not answer the refresh (a phone in airplane mode leaves it hanging), then the page keeps the copy and is done once the refresh gives up', () => {
    const received = ask(NEWS);
    workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);
    const refresh = serverRefresh(NEWS);

    vi.advanceTimersByTime(REFRESH_WAIT_MS - 1);
    expect(received.completed).toBe(false);
    vi.advanceTimersByTime(1);

    expect(refresh.cancelled).toBe(true);
    expect(received.answers).toEqual([{ items: ['old'] }]);
    expect(received.failed).toBe(false);
    expect(received.completed).toBe(true);
  });

  describe('when the app knows it is offline', () => {
    beforeEach(() => {
      TestBed.inject(Connectivity);
      window.dispatchEvent(new Event('offline'));
      http.expectOne(PROBE_PATH);
    });

    it('and the worker has the page, then the page gets its copy at once', () => {
      const received = ask(NEWS);
      workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);

      expect(received.answers).toEqual([{ items: ['old'] }]);
      expect(received.completed).toBe(true);
    });

    it('and the worker gives no answer at once (a page it never kept), then the page is told it is offline instead of waiting on', () => {
      const received = ask(NEWS);
      const waiting = http.expectOne((asked) => asked.urlWithParams === NEWS);

      vi.advanceTimersByTime(OFFLINE_ANSWER_WAIT_MS - 1);
      expect(received.failed).toBe(false);
      vi.advanceTimersByTime(1);

      expect(waiting.cancelled).toBe(true);
      expect(received.failed).toBe(true);
      expect((received.failure as HttpErrorResponse).status).toBe(0);
    });
  });

  it('when the worker answers with what it fetched just now, then nothing more is asked', () => {
    const received = ask(NEWS);
    workerAnswers(NEWS, { items: ['new'] }, JUST_NOW);

    expect(received.answers).toEqual([{ items: ['new'] }]);
    expect(received.completed).toBe(true);
  });

  it('when the app is offline, then the copy is shown and the server is not asked', () => {
    TestBed.inject(Connectivity);
    window.dispatchEvent(new Event('offline'));
    http.expectOne(PROBE_PATH);
    const received = ask(NEWS);
    workerAnswers(NEWS, { items: ['old'] }, MINUTES_AGO);

    expect(received.answers).toEqual([{ items: ['old'] }]);
    expect(received.completed).toBe(true);
    http.expectNone((asked) => asked.url !== PROBE_PATH && asked.headers.has('ngsw-bypass'));
  });

  it.each([
    '/api/donations/payment-details',
    '/api/content/media/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  ])('when %s comes from a copy, then it is left to its own page', (url) => {
    const received = ask(url);
    workerAnswers(url, { kept: true }, MINUTES_AGO);

    expect(received.completed).toBe(true);
    http.expectNone((asked) => asked.url !== PROBE_PATH && asked.headers.has('ngsw-bypass'));
  });
});
