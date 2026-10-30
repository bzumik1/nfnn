import { TestBed } from '@angular/core/testing';

import { Connectivity } from '../navigation/connectivity';
import { ErrorReporter } from './error-reporter';
import { ERROR_NAMES } from './error-vocabulary';

const CANARY = 'Zxqv Kanárek 7781,77 Kč 2099-778177';
const TEN_MINUTES = 10 * 60 * 1000;
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

describe('Given the browser error reporter', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let offline: boolean;
  let reporter: ErrorReporter;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T09:00:00Z'));
    fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
    offline = false;
    TestBed.configureTestingModule({
      providers: [{ provide: Connectivity, useValue: { isOffline: () => offline } }],
    });
    reporter = TestBed.inject(ErrorReporter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const sentBodies = () =>
    fetchSpy.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

  describe('when an error carrying a name, an amount and a receipt number is reported', () => {
    beforeEach(() => reporter.report('unexpected', 'global', new Error(CANARY)));

    it('then it arrives as its closed values only', () => {
      expect(sentBodies()).toEqual([
        {
          kind: 'unexpected',
          place: 'global',
          name: 'Error',
          appVersion: 'dev',
          browser: 'safari',
          browserMajor: 18,
          os: 'ios',
          display: 'browser',
          count: 1,
        },
      ]);
    });

    it('then no trace of the text leaves the browser, plain, URL-encoded or in base64', () => {
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const sent = `${url} ${String(init.body)} ${JSON.stringify(init.headers)}`;
      for (const part of [CANARY, 'Kanárek', '7781', '2099-778177']) {
        expect(sent).not.toContain(part);
        expect(sent).not.toContain(encodeURIComponent(part));
        expect(sent).not.toContain(btoa(unescape(encodeURIComponent(part))));
      }
    });

    it('then it is posted as JSON with keepalive and without credentials or a token', () => {
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/operations/client-errors');
      expect(init.method).toBe('POST');
      expect(init.keepalive).toBe(true);
      expect(init.credentials).toBe('omit');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    });
  });

  it.each([
    ['a TypeError', new TypeError(CANARY), 'TypeError'],
    [
      'a DOMException of an allowed name',
      new DOMException(CANARY, 'QuotaExceededError'),
      'QuotaExceededError',
    ],
    [
      'an error with a name of its own',
      Object.assign(new Error(CANARY), { name: CANARY }),
      'Other',
    ],
    ['a thrown string', CANARY, 'Other'],
    ['a thrown object', { name: 'TypeError', message: CANARY }, 'TypeError'],
    ['nothing', undefined, 'Other'],
  ])('when %s is reported, then only an allowed name or Other is sent', (_what, error, name) => {
    reporter.report('unexpected', 'global', error);

    expect(sentBodies().map((body) => body.name)).toEqual([name]);
  });

  describe('when the same failure repeats within 10 minutes', () => {
    beforeEach(() => {
      reporter.report('pdf-render', 'global', new TypeError('a'));
      reporter.report('pdf-render', 'global', new TypeError('b'));
      reporter.report('pdf-render', 'global', new TypeError('c'));
    });

    it('then it is sent once', () => {
      expect(sentBodies()).toHaveLength(1);
    });

    it('and another failure comes, then that one is sent at once', () => {
      reporter.report('pdf-render', 'navigation', new TypeError('d'));

      expect(sentBodies().map((body) => [body.place, body.count])).toEqual([
        ['global', 1],
        ['navigation', 1],
      ]);
    });

    it('and it comes again after 10 minutes, then the next report counts the repeats it held back', () => {
      vi.advanceTimersByTime(TEN_MINUTES - 1);
      reporter.report('pdf-render', 'global', new TypeError('e'));
      vi.advanceTimersByTime(1);
      reporter.report('pdf-render', 'global', new TypeError('f'));

      expect(sentBodies().map((body) => body.count)).toEqual([1, 4]);
    });
  });

  it('when one failure repeats more than a hundred times, then its count stops at 100', () => {
    for (let repeat = 0; repeat < 150; repeat++) {
      reporter.report('qr-encode', 'global');
    }
    vi.advanceTimersByTime(TEN_MINUTES);
    reporter.report('qr-encode', 'global');

    expect(sentBodies().map((body) => body.count)).toEqual([1, 100]);
  });

  it('when more than ten different failures happen on one page load, then only the first ten are sent', () => {
    ERROR_NAMES.slice(0, 15).forEach((name) =>
      reporter.report('unexpected', 'global', { name, message: CANARY }),
    );

    expect(sentBodies().map((body) => body.name)).toEqual(ERROR_NAMES.slice(0, 10));
  });

  describe('when the browser is offline', () => {
    beforeEach(() => {
      offline = true;
      ERROR_NAMES.slice(0, 25).forEach((name) => reporter.report('unexpected', 'global', { name }));
    });

    it('then nothing is sent', () => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('and it comes back online, then the held reports go out, at most ten per page load', () => {
      offline = false;
      window.dispatchEvent(new Event('online'));

      expect(sentBodies().map((body) => body.name)).toEqual(ERROR_NAMES.slice(0, 10));
    });
  });

  it('when sending fails, then the failure is never reported and nothing is thrown', async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(() => reporter.report('unexpected', 'global', new Error(CANARY))).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('when fetch itself throws, then nothing is thrown', () => {
    fetchSpy.mockImplementation(() => {
      throw new TypeError('keepalive quota');
    });

    expect(() => reporter.report('unexpected', 'global', new Error(CANARY))).not.toThrow();
  });
});
