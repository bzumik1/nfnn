import { HttpEventType, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { AuthStore } from '../auth/auth-store';
import { authResponse, sampleDonor } from '../auth/testing/donor-fixtures';
import {
  LIVE_HIDDEN_GRACE_MS,
  LIVE_RETRY_FIRST_MS,
  LIVE_RETRY_MAX_MS,
  LIVE_SHORT_STREAM_MS,
  LiveFeed,
  LiveUpdates,
} from './live-updates';

const LIVE = '/api/live';
const REVISION = 'event:revision\ndata:{"revision":"f00ba12"}\n\n';

function changed(feed: string): string {
  return `event:changed\ndata:{"feed":"${feed}"}\n\n`;
}

describe('Given the live updates of a signed-in browser', () => {
  let live: LiveUpdates;
  let store: AuthStore;
  let http: HttpTestingController;
  let visibility: DocumentVisibilityState;
  const subscriptions: Subscription[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    localStorage.clear();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LiveUpdates, useClass: LiveUpdates },
      ],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
    live = TestBed.inject(LiveUpdates);
  });

  afterEach(() => {
    subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    TestBed.tick();
    http.verify();
    Reflect.deleteProperty(document, 'visibilityState');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function signIn(roles: string[] = ['DONOR']): void {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor({ roles })));
    TestBed.tick();
  }

  function listen(feeds: readonly LiveFeed[]): { count: () => number } {
    let count = 0;
    subscriptions.push(live.changes(feeds).subscribe(() => count++));
    TestBed.tick();
    return { count: () => count };
  }

  function stream(): TestRequest {
    return http.expectOne(LIVE);
  }

  function send(request: TestRequest, text: string): void {
    request.event({ type: HttpEventType.DownloadProgress, loaded: text.length, partialText: text });
  }

  function hide(): void {
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function show(): void {
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    TestBed.tick();
  }

  it('when nobody listens, then no stream is opened', () => {
    signIn();

    http.expectNone(LIVE);
  });

  it('when someone listens but nobody is signed in, then no stream is opened', () => {
    listen(['donations']);

    http.expectNone(LIVE);
  });

  describe('when a page listens', () => {
    let donations: { count: () => number };
    let request: TestRequest;

    beforeEach(() => {
      signIn();
      donations = listen(['donations', 'bank-accounts']);
      request = stream();
    });

    it('then one event stream is asked for and is connected once the revision arrives', () => {
      expect(request.request.headers.get('Accept')).toBe('text/event-stream');
      expect(request.request.responseType).toBe('text');
      expect(live.connected()).toBe(false);

      send(request, REVISION);

      expect(live.connected()).toBe(true);
      expect(donations.count()).toBe(0);
    });

    it('then a second page shares the same stream', () => {
      listen(['payments']);

      http.expectNone(LIVE);
      expect(request.cancelled).toBe(false);
    });

    it('then a hint of a feed it listens to reaches it once, in whatever pieces the text arrives', () => {
      const text = REVISION + changed('donations');
      send(request, text.slice(0, 30));
      send(request, text.slice(0, text.length - 3));
      send(request, text);

      expect(donations.count()).toBe(1);
    });

    it('then hints of other feeds, heartbeats and unknown or broken events do not reach it', () => {
      const payments = listen(['payments']);
      send(
        request,
        REVISION +
          changed('payments') +
          ':\n\n' +
          changed('something-else') +
          'event:changed\ndata:not json\n\n',
      );

      expect(donations.count()).toBe(0);
      expect(payments.count()).toBe(1);
    });

    it('then the stream is closed when the last page stops listening', () => {
      subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
      TestBed.tick();

      expect(request.cancelled).toBe(true);
      expect(live.connected()).toBe(false);
    });

    it('then the stream is closed when the donor signs out', () => {
      store.logout().subscribe();
      http.expectOne('/api/donors/auth/logout').flush(null);
      TestBed.tick();

      expect(request.cancelled).toBe(true);
    });

    it('then a tab hidden for a moment keeps its stream, and one hidden longer closes it until it is shown again', () => {
      send(request, REVISION);
      hide();
      vi.advanceTimersByTime(LIVE_HIDDEN_GRACE_MS - 1);
      show();
      expect(request.cancelled).toBe(false);

      hide();
      vi.advanceTimersByTime(LIVE_HIDDEN_GRACE_MS);
      TestBed.tick();
      expect(request.cancelled).toBe(true);
      http.expectNone(LIVE);

      show();
      const again = stream();
      send(again, REVISION);
      expect(donations.count()).toBe(1);
    });

    it('then a stream that ends after a while is opened again at once and the page reads again what it may have missed', () => {
      send(request, REVISION);
      vi.advanceTimersByTime(LIVE_SHORT_STREAM_MS);
      request.flush(REVISION);
      expect(live.connected()).toBe(false);

      vi.advanceTimersByTime(LIVE_RETRY_FIRST_MS);
      const again = stream();
      send(again, REVISION);

      expect(donations.count()).toBe(1);
    });

    it('then a page that starts listening after the stream closed is not told to read again when the stream reopens', () => {
      send(request, REVISION);
      subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
      TestBed.tick();
      expect(request.cancelled).toBe(true);

      const payments = listen(['payments']);
      send(stream(), REVISION);

      expect(payments.count()).toBe(0);
    });

    it('then an answer that the client asks for again, as after a refreshed token, is read from its own start', () => {
      send(request, '{"status":401}');
      request.event({ type: HttpEventType.Sent });
      send(request, REVISION);

      expect(live.connected()).toBe(true);
    });

    it('then a stream that ends in an error after a while starts its retries again from a second', () => {
      request.flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
      vi.advanceTimersByTime(LIVE_RETRY_FIRST_MS);
      const again = stream();
      send(again, REVISION);
      vi.advanceTimersByTime(LIVE_SHORT_STREAM_MS);
      again.error(new ProgressEvent('error'));

      vi.advanceTimersByTime(LIVE_RETRY_FIRST_MS - 1);
      http.expectNone(LIVE);
      vi.advanceTimersByTime(1);
      stream();
    });

    it('then failures are retried later and later, up to a minute apart', () => {
      request.flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });

      const delays = [];
      for (const expected of [1, 2, 4, 8, 16, 32, 60, 60].map((seconds) => seconds * 1000)) {
        vi.advanceTimersByTime(expected - 1);
        http.expectNone(LIVE);
        vi.advanceTimersByTime(1);
        stream().error(new ProgressEvent('error'));
        delays.push(expected);
      }

      expect(Math.max(...delays)).toBe(LIVE_RETRY_MAX_MS);
      subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
      TestBed.tick();
      vi.advanceTimersByTime(LIVE_RETRY_MAX_MS);
      http.expectNone(LIVE);
    });

    it('then a refused stream is not asked for again until another sign-in', () => {
      request.flush('', { status: 403, statusText: 'Forbidden' });
      vi.advanceTimersByTime(LIVE_RETRY_MAX_MS * 2);
      http.expectNone(LIVE);

      store.logout().subscribe();
      http.expectOne('/api/donors/auth/logout').flush(null);
      TestBed.tick();
      signIn();

      stream();
    });
  });
});
