import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { serviceWorkerBypassInterceptor } from '../updates/service-worker-bypass';
import {
  Connectivity,
  OFFLINE_AFTER_MS,
  PROBE_EVERY_MS,
  PROBE_PATH,
  PROBE_TIMEOUT_MS,
} from './connectivity';
import { connectivityInterceptor } from './connectivity-interceptor';

const HOME = '/api/content/home';
const PROFILE = '/api/donors/me';
const NOW = Date.UTC(2026, 10, 5, 11, 30);

describe('Given the connectivity of the app', () => {
  let connectivity: Connectivity;
  let client: HttpClient;
  let http: HttpTestingController;
  let onLine: boolean;
  let visibility: DocumentVisibilityState;

  function start(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(
          withInterceptors([serviceWorkerBypassInterceptor, connectivityInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    connectivity = TestBed.inject(Connectivity);
  }

  function ask(url: string): void {
    client.get(url).subscribe({ error: () => undefined });
  }

  function networkFails(url: string): void {
    http.expectOne(url).error(new ProgressEvent('error'), { status: 0, statusText: '' });
  }

  function answers(url: string, status = 200, headers: Record<string, string> = {}): void {
    http.expectOne(url).flush(status < 300 ? {} : '<html></html>', {
      status,
      statusText: 'Answer',
      headers: { Date: new Date(Date.now()).toUTCString(), ...headers },
    });
  }

  function browserSays(event: 'online' | 'offline'): void {
    onLine = event === 'online';
    window.dispatchEvent(new Event(event));
  }

  function tabBecomes(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function goOffline(): void {
    ask(PROFILE);
    networkFails(PROFILE);
    networkFails(PROBE_PATH);
    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    onLine = true;
    visibility = 'visible';
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => onLine);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    http.verify();
  });

  describe('when a request reaches nothing', () => {
    beforeEach(() => {
      start();
      ask(PROFILE);
      networkFails(PROFILE);
    });

    it('then it asks the server at once whether it is still there', () => {
      http.expectOne(PROBE_PATH).flush({});
    });

    it('and the server does not answer for 3 s either, then the app is offline without a network', () => {
      networkFails(PROBE_PATH);

      vi.advanceTimersByTime(OFFLINE_AFTER_MS - 1);
      expect(connectivity.offline()).toBe(false);

      vi.advanceTimersByTime(1);
      expect(connectivity.offline()).toBe(true);
      expect(connectivity.cause()).toBe('network');
    });

    it('and the probe answers, then the app stays online, so a weak signal does not flicker the label', () => {
      answers(PROBE_PATH);

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(false);
    });

    it('and another request is answered within 3 s, then the app stays online', () => {
      networkFails(PROBE_PATH);
      ask(HOME);
      answers(HOME, 404);

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(false);
    });

    it('and the probe hangs, then the app is offline after 3 s', () => {
      http.expectOne(PROBE_PATH);

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(true);
    });
  });

  it('when the server answers 522 and the probe then hangs, then the probe is cancelled after 10 s and the cause becomes the network', () => {
    start();
    ask(PROFILE);
    answers(PROFILE, 522, { 'Content-Type': 'text/html' });
    const probe = http.expectOne(PROBE_PATH);

    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.cause()).toBe('server');

    vi.advanceTimersByTime(PROBE_TIMEOUT_MS - OFFLINE_AFTER_MS - 1);
    expect(probe.cancelled).toBe(false);
    vi.advanceTimersByTime(1);
    expect(probe.cancelled).toBe(true);
    expect(connectivity.cause()).toBe('network');
  });

  for (const status of [500, 519, 531]) {
    it(`when a request gets ${status} as a page of the proxy, then that is no gateway failure and the server counts as reachable`, () => {
      start();
      ask(PROFILE);
      answers(PROFILE, status, { 'Content-Type': 'text/html' });

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      http.expectNone(PROBE_PATH);
      expect(connectivity.offline()).toBe(false);
    });
  }

  for (const status of [503, 504]) {
    it(`when the backend itself answers ${status} with a problem, then the server is reachable and nothing is probed`, () => {
      start();
      ask(PROFILE);
      answers(PROFILE, status, { 'Content-Type': 'application/problem+json' });

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      http.expectNone(PROBE_PATH);
      expect(connectivity.offline()).toBe(false);
    });
  }

  it('when a gateway answer carries no content type, then it counts as a gateway failure', () => {
    start();
    ask(PROFILE);
    http.expectOne(PROFILE).flush(null, { status: 502, statusText: 'Bad Gateway' });

    http.expectOne(PROBE_PATH);
    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.offline()).toBe(true);
  });

  it('when a gateway answer comes while the browser says it is offline, then the cause is the network', () => {
    start();
    onLine = false;
    ask(PROFILE);
    answers(PROFILE, 522, { 'Content-Type': 'text/html' });
    http.expectOne(PROBE_PATH);

    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.cause()).toBe('network');
  });

  for (const status of [502, 503, 504, 520, 521, 522, 523, 524, 530]) {
    it(`when a request gets ${status} from the edge or the proxy while the device is online, then after 3 s the app says the server does not answer`, () => {
      start();
      ask(PROFILE);
      answers(PROFILE, status, { 'Content-Type': 'text/html' });
      answers(PROBE_PATH, status, { 'Content-Type': 'text/html' });

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(true);
      expect(connectivity.cause()).toBe('server');
    });
  }

  it('when the backend itself answers 502 with a problem (an upstream it called failed), then the server is reachable and nothing is probed', () => {
    start();
    ask(PROFILE);
    answers(PROFILE, 502, { 'Content-Type': 'application/problem+json' });

    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.offline()).toBe(false);
  });

  it('when the backend answers 500, then the server is reachable', () => {
    start();
    ask(PROFILE);
    answers(PROFILE, 500, { 'Content-Type': 'application/problem+json' });

    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.offline()).toBe(false);
  });

  it('when the service worker answers 504 for a public answer it does not keep, then the cause is the network, as the worker answers so when it reached nothing', () => {
    start();
    ask(HOME);
    answers(HOME, 504, { 'Content-Type': 'text/plain' });
    http.expectOne(PROBE_PATH);

    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.cause()).toBe('network');
  });

  it('when the browser says it went offline, then the app probes at once and is offline 3 s later, never on the browser word alone', () => {
    start();
    browserSays('offline');
    expect(connectivity.offline()).toBe(false);

    networkFails(PROBE_PATH);
    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.offline()).toBe(true);
    expect(connectivity.cause()).toBe('network');
  });

  it('when the browser says it is offline at the start but the server answers the probe, then the app is online', () => {
    onLine = false;
    start();
    vi.advanceTimersByTime(0);
    answers(PROBE_PATH);

    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    expect(connectivity.offline()).toBe(false);
  });

  describe('when the service worker answers from its copy', () => {
    beforeEach(() => start());

    it('and the answer is minutes old, then the app probes, and a failed probe makes it offline', () => {
      ask(HOME);
      answers(HOME, 200, { Date: new Date(NOW - 5 * 60_000).toUTCString() });

      networkFails(PROBE_PATH);
      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(true);
    });

    it('and the answer was just fetched, then it counts as contact and nothing is probed', () => {
      ask(HOME);
      answers(HOME, 200, { Date: new Date(NOW - 2_000).toUTCString() });

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(false);
    });

    it('and the device clock is ahead of the server, then a fresh answer is not taken for an old one once the server time is known', () => {
      vi.setSystemTime(NOW + 120_000);
      ask(PROFILE);
      answers(PROFILE, 200, { Date: new Date(NOW).toUTCString() });
      ask(HOME);
      answers(HOME, 200, { Date: new Date(NOW).toUTCString() });

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(false);
    });

    it('and the answer carries no date, then it says nothing about the connection', () => {
      ask(HOME);
      http.expectOne(HOME).flush({});

      vi.advanceTimersByTime(OFFLINE_AFTER_MS);
      expect(connectivity.offline()).toBe(false);
    });
  });

  describe('when the app is offline', () => {
    beforeEach(() => {
      start();
      goOffline();
    });

    it('then it probes every 30 s and is online again at the first answer, and then stops probing', () => {
      vi.advanceTimersByTime(PROBE_EVERY_MS - 1);
      http.expectNone(PROBE_PATH);
      vi.advanceTimersByTime(1);
      networkFails(PROBE_PATH);
      expect(connectivity.offline()).toBe(true);

      vi.advanceTimersByTime(PROBE_EVERY_MS);
      answers(PROBE_PATH);
      expect(connectivity.offline()).toBe(false);

      vi.advanceTimersByTime(PROBE_EVERY_MS * 3);
      http.expectNone(PROBE_PATH);
    });

    it('and any request is answered, then it is online at once', () => {
      ask(HOME);
      answers(HOME, 404);

      expect(connectivity.offline()).toBe(false);
    });

    it('and the service worker answers from a copy it kept seconds ago, then the app stays offline until the probe reaches the server', () => {
      ask(HOME);
      answers(HOME, 200, { Date: new Date(Date.now() - 2_000).toUTCString() });
      expect(connectivity.offline()).toBe(true);

      answers(PROBE_PATH);
      expect(connectivity.offline()).toBe(false);
    });

    it('and the browser says it is online, then it probes at once', () => {
      browserSays('online');
      answers(PROBE_PATH);

      expect(connectivity.offline()).toBe(false);
    });

    it('and the tab is hidden, then it does not probe until the tab is visible again', () => {
      tabBecomes('hidden');
      vi.advanceTimersByTime(PROBE_EVERY_MS * 3);
      http.expectNone(PROBE_PATH);

      tabBecomes('visible');
      answers(PROBE_PATH);
      expect(connectivity.offline()).toBe(false);
    });

    it('and the visitor asks to try again, then it probes at once and reports what it found', () => {
      let reachable: boolean | undefined;
      connectivity.tryAgain().subscribe((found) => (reachable = found));
      answers(PROBE_PATH);

      expect(reachable).toBe(true);
      expect(connectivity.offline()).toBe(false);
    });

    it('and the visitor asks to try again while the network is still gone, then it reports so and stays offline', () => {
      let reachable: boolean | undefined;
      connectivity.tryAgain().subscribe((found) => (reachable = found));
      networkFails(PROBE_PATH);

      expect(reachable).toBe(false);
      expect(connectivity.offline()).toBe(true);
    });

    it('and a gateway answer comes next, then the cause becomes the server', () => {
      ask(PROFILE);
      answers(PROFILE, 522, { 'Content-Type': 'text/html' });

      expect(connectivity.cause()).toBe('server');
    });
  });

  it('when the browser says it is offline, then that word alone is told to whoever only needs it, as the error reports do', () => {
    start();
    expect(connectivity.browserSaysOffline()).toBe(false);

    onLine = false;
    expect(connectivity.browserSaysOffline()).toBe(true);
    expect(connectivity.offline()).toBe(false);
  });

  it('when requests go to something other than the API, then they say nothing about the connection', () => {
    start();
    ask('/receipt-fonts/body.ttf');
    networkFails('/receipt-fonts/body.ttf');

    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    http.expectNone(PROBE_PATH);
    expect(connectivity.offline()).toBe(false);
  });
});
