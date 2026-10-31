import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationError, provideRouter, Router } from '@angular/router';

import { ErrorReporter } from '../errors/error-reporter';
import { Connectivity } from '../navigation/connectivity';
import { ExternalNavigation } from '../navigation/external-navigation';
import { ChunkLoadRecovery, isChunkLoadError } from './chunk-load-recovery';
import { ChunkProbe } from './chunk-probe';
import { ReloadGuard } from './reload-guard';

@Component({ template: '' })
class Page {}

const CHROME = new TypeError(
  'Failed to fetch dynamically imported module: https://nfnn.cz/chunk-BQ1Fwj_M.js',
);

describe('Given errors thrown while a page loads', () => {
  it.each([
    ['Chromium', CHROME],
    [
      'Firefox',
      new TypeError('error loading dynamically imported module: https://nfnn.cz/chunk-BQ1Fwj_M.js'),
    ],
    ['Safari', new TypeError('Importing a module script failed.')],
    [
      'Safari, for an HTML answer',
      new TypeError("'text/html' is not a valid JavaScript MIME type."),
    ],
    [
      'Chromium, for an HTML answer',
      new TypeError(
        'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
      ),
    ],
  ])('when %s fails to load a chunk, then it is a chunk-load error', (_browser, error) => {
    expect(isChunkLoadError(error)).toBe(true);
  });

  it.each([
    ['a programming error', new TypeError("Cannot read properties of undefined (reading 'id')")],
    ['an HTTP failure', new Error('Http failure response for /api/donors/me: 500')],
    ['a plain string', 'Failed to fetch dynamically imported module'],
    ['nothing', undefined],
  ])('when the error is %s, then it is not a chunk-load error', (_what, error) => {
    expect(isChunkLoadError(error)).toBe(false);
  });
});

describe('Given the chunk-load recovery', () => {
  let claim: ReturnType<typeof vi.fn>;
  let loadFromServer: ReturnType<typeof vi.fn>;
  let isOffline: ReturnType<typeof vi.fn>;
  let reloadWouldLand: ReturnType<typeof vi.fn>;
  let report: ReturnType<typeof vi.fn>;
  let recovery: ChunkLoadRecovery;

  beforeEach(() => {
    claim = vi.fn(() => true);
    loadFromServer = vi.fn();
    isOffline = vi.fn(() => false);
    reloadWouldLand = vi.fn(() => Promise.resolve(true));
    report = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'jinam', component: Page },
          { path: 'dale', component: Page },
        ]),
        { provide: ReloadGuard, useValue: { claim } },
        { provide: ExternalNavigation, useValue: { loadFromServer } },
        { provide: Connectivity, useValue: { isOffline } },
        { provide: ChunkProbe, useValue: { reloadWouldLand } },
        { provide: ErrorReporter, useValue: { report } },
      ],
    });
    recovery = TestBed.inject(ChunkLoadRecovery);
  });

  const failure = (error: unknown, url = '/darce/prehled') => new NavigationError(1, url, error);
  const showPage = () => TestBed.inject(Router).navigateByUrl('/jinam');

  describe('when a lazy page fails to load and the guard allows a reload', () => {
    beforeEach(() => recovery.handleNavigationError(failure(CHROME, '/#prispet')));

    it('then it reports the lost chunk to the server as chunk-load at the navigation', () => {
      expect(report).toHaveBeenCalledExactlyOnceWith('chunk-load', 'navigation', CHROME);
    });

    it('then it asks the server about the failed chunk first', () => {
      expect(reloadWouldLand).toHaveBeenCalledExactlyOnceWith(CHROME);
    });

    it('then it claims the chunk-load reload', () => {
      expect(claim).toHaveBeenCalledWith('chunk-load');
    });

    it('then it loads the page that was asked for from the server, fragment included', () => {
      expect(loadFromServer).toHaveBeenCalledExactlyOnceWith('/#prispet');
    });

    it('then it already offers the reload, so a browser that stays on the page still shows it', () => {
      expect(recovery.failure()).toEqual({ url: '/#prispet', initial: true });
    });
  });

  describe('when a lazy page fails to load and the server takes its time to answer the probe', () => {
    let answer: (lands: boolean) => void;
    let handled: Promise<void>;

    beforeEach(async () => {
      await showPage();
      reloadWouldLand.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));
      handled = recovery.handleNavigationError(failure(CHROME));
    });

    it('then it offers the reload while it waits', () => {
      expect(recovery.failure()).toEqual({ url: '/darce/prehled', initial: false });
    });

    it('and the answer says a reload lands, then it loads the page from the server', async () => {
      answer(true);
      await handled;

      expect(loadFromServer).toHaveBeenCalledExactlyOnceWith('/darce/prehled');
    });

    it('and the visitor opens another page before the answer, then the late answer does not take them back', async () => {
      await TestBed.inject(Router).navigateByUrl('/dale');
      answer(true);
      await handled;

      expect(claim).not.toHaveBeenCalled();
      expect(loadFromServer).not.toHaveBeenCalled();
      expect(recovery.failure()).toBeNull();
    });
  });

  describe('when a lazy page fails to load and the server cannot be reached though the browser says it is online', () => {
    beforeEach(async () => {
      await showPage();
      reloadWouldLand.mockResolvedValue(false);
      await recovery.handleNavigationError(failure(CHROME));
    });

    it('then it keeps the reload of the guard and does not reload into an error page of the browser', () => {
      expect(claim).not.toHaveBeenCalled();
      expect(loadFromServer).not.toHaveBeenCalled();
    });

    it('then it offers a reload of that page', () => {
      expect(recovery.failure()).toEqual({ url: '/darce/prehled', initial: false });
    });
  });

  describe('when a lazy page fails to load after a page was shown and the guard refuses a reload', () => {
    beforeEach(async () => {
      await showPage();
      claim.mockReturnValue(false);
      await recovery.handleNavigationError(failure(CHROME));
    });

    it('then it does not reload', () => {
      expect(loadFromServer).not.toHaveBeenCalled();
    });

    it('then it offers a reload of the page that was asked for over the page still shown', () => {
      expect(recovery.failure()).toEqual({ url: '/darce/prehled', initial: false });
    });

    it('and the visitor asks for the reload, then it loads that page from the server', () => {
      recovery.reload();

      expect(loadFromServer).toHaveBeenCalledExactlyOnceWith('/darce/prehled');
    });

    it('and a later navigation succeeds, then the offer goes away', async () => {
      await TestBed.inject(Router).navigateByUrl('/dale');

      expect(recovery.failure()).toBeNull();
    });
  });

  it('when the first page fails to load and the guard refuses a reload, then the offer says no page is shown', async () => {
    claim.mockReturnValue(false);

    await recovery.handleNavigationError(failure(CHROME));

    expect(recovery.failure()).toEqual({ url: '/darce/prehled', initial: true });
  });

  describe('when a lazy page fails to load while the browser is offline', () => {
    beforeEach(async () => {
      await showPage();
      isOffline.mockReturnValue(true);
      await recovery.handleNavigationError(failure(CHROME));
    });

    it('then it asks the server nothing', () => {
      expect(reloadWouldLand).not.toHaveBeenCalled();
    });

    it('then it keeps the reload of the guard and does not reload', () => {
      expect(claim).not.toHaveBeenCalled();
      expect(loadFromServer).not.toHaveBeenCalled();
    });

    it('then it offers a reload of that page', () => {
      expect(recovery.failure()).toEqual({ url: '/darce/prehled', initial: false });
    });
  });

  it('when a navigation fails for another reason, then it neither reloads nor offers anything', async () => {
    await recovery.handleNavigationError(failure(new Error('guard failed')));

    expect(reloadWouldLand).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(loadFromServer).not.toHaveBeenCalled();
    expect(recovery.failure()).toBeNull();
    expect(report).not.toHaveBeenCalled();
  });
});
