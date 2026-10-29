import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationError, provideRouter, Router } from '@angular/router';

import { ExternalNavigation } from '../navigation/external-navigation';
import { ChunkLoadRecovery, isChunkLoadError } from './chunk-load-recovery';
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
  let assign: ReturnType<typeof vi.fn>;
  let recovery: ChunkLoadRecovery;

  beforeEach(() => {
    claim = vi.fn(() => true);
    assign = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'jinam', component: Page }]),
        { provide: ReloadGuard, useValue: { claim } },
        { provide: ExternalNavigation, useValue: { assign } },
      ],
    });
    recovery = TestBed.inject(ChunkLoadRecovery);
  });

  const failure = (error: unknown) => new NavigationError(1, '/darce/prehled', error);

  describe('when a lazy page fails to load and the guard allows a reload', () => {
    beforeEach(() => recovery.handleNavigationError(failure(CHROME)));

    it('then it claims the chunk-load reload', () => {
      expect(claim).toHaveBeenCalledWith('chunk-load');
    });

    it('then it loads the page that was asked for from the server', () => {
      expect(assign).toHaveBeenCalledExactlyOnceWith('/darce/prehled');
    });

    it('then it offers nothing', () => {
      expect(recovery.failedUrl()).toBeNull();
    });
  });

  describe('when a lazy page fails to load and the guard refuses a reload', () => {
    beforeEach(() => {
      claim.mockReturnValue(false);
      recovery.handleNavigationError(failure(CHROME));
    });

    it('then it does not reload', () => {
      expect(assign).not.toHaveBeenCalled();
    });

    it('then it offers a reload of the page that was asked for', () => {
      expect(recovery.failedUrl()).toBe('/darce/prehled');
    });

    it('and the visitor asks for the reload, then it loads that page', () => {
      recovery.reload();

      expect(assign).toHaveBeenCalledExactlyOnceWith('/darce/prehled');
    });

    it('and a later navigation succeeds, then the offer goes away', async () => {
      await TestBed.inject(Router).navigateByUrl('/jinam');

      expect(recovery.failedUrl()).toBeNull();
    });
  });

  it('when a navigation fails for another reason, then it neither reloads nor offers anything', () => {
    recovery.handleNavigationError(failure(new Error('guard failed')));

    expect(claim).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(recovery.failedUrl()).toBeNull();
  });
});
