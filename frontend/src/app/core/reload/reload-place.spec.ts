import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type Event as RouterEvent,
  NavigationEnd,
  provideRouter,
  Router,
  Scroll,
} from '@angular/router';
import { Subject } from 'rxjs';

import { AppTabId } from '../navigation/app-tabs';
import { SESSION_STORAGE } from './reload-guard';
import { PLACE_WAIT_LONGEST_MS, RELOAD_PLACE_KEY, ReloadPlace } from './reload-place';

@Component({ template: '' })
class Page {}

const START = Date.UTC(2026, 10, 12, 9, 0, 0);

function pageHeight(height: number): void {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    get: () => height,
  });
}

function routerScrollsAfter(router: Router, url: string): void {
  const arrived = new NavigationEnd(1, url, url);
  (router.events as Subject<RouterEvent>).next(arrived);
  (router.events as Subject<RouterEvent>).next(new Scroll(arrived, null, null));
}

function storedPlace(): unknown {
  const stored = sessionStorage.getItem(RELOAD_PLACE_KEY);
  return stored === null ? null : JSON.parse(stored);
}

function startApp(storage: () => Storage = () => sessionStorage): {
  readonly place: ReloadPlace;
  readonly router: Router;
} {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', component: Page }]),
      { provide: SESSION_STORAGE, useValue: storage },
    ],
  });
  return { place: TestBed.inject(ReloadPlace), router: TestBed.inject(Router) };
}

function keepBeforeReload(
  url: string,
  scrolledTo: number,
  tabs: ReadonlyMap<AppTabId, string> = new Map(),
): void {
  const { place } = startApp();
  place.followTabs(() => tabs);
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrolledTo });
  place.keep(url);
  TestBed.resetTestingModule();
}

describe('Given the place the app keeps for its own reload', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(START);
    history.replaceState(null, '', '/aktuality/novy-clanek?strana=2#galerie');
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    pageHeight(0);
  });

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    sessionStorage.removeItem(RELOAD_PLACE_KEY);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    scrollTo.mockRestore();
    vi.useRealTimers();
  });

  it('when the app reloads the page it shows, then it keeps the address without its section, how far the page was read and the page of each tab', () => {
    keepBeforeReload(
      '/aktuality/novy-clanek?strana=2#galerie',
      1200,
      new Map<AppTabId, string>([
        ['news', '/aktuality/novy-clanek?strana=2'],
        ['projects', '/projekty/sofinka'],
      ]),
    );

    expect(storedPlace()).toEqual({
      address: '/aktuality/novy-clanek?strana=2',
      top: 1200,
      tabs: { news: '/aktuality/novy-clanek?strana=2', projects: '/projekty/sofinka' },
      at: START,
    });
  });

  it('when the app reloads into another page, then it keeps the page of each tab but no reading position', () => {
    keepBeforeReload('/kontakt', 1200);

    expect(storedPlace()).toEqual({ address: '/kontakt', top: null, tabs: {}, at: START });
  });

  it('when the session storage refuses, then nothing is kept and nothing fails', () => {
    const { place } = startApp(() => {
      throw new Error('denied');
    });

    expect(() => place.keep('/kontakt')).not.toThrow();
  });

  describe('after the reload', () => {
    beforeEach(() =>
      keepBeforeReload(
        '/aktuality/novy-clanek?strana=2#galerie',
        1200,
        new Map<AppTabId, string>([
          ['news', '/aktuality/novy-clanek?strana=2'],
          ['projects', '/projekty/sofinka'],
        ]),
      ),
    );

    it('when the app starts again, then it takes the kept place once and leaves nothing behind', () => {
      const { place } = startApp();

      expect([...place.keptTabs()]).toEqual([
        ['news', '/aktuality/novy-clanek?strana=2'],
        ['projects', '/projekty/sofinka'],
      ]);
      expect(sessionStorage.getItem(RELOAD_PLACE_KEY)).toBeNull();
    });

    it('when the first page has grown tall enough, then it is put back where it was read', async () => {
      pageHeight(5000);
      routerScrollsAfter(startApp().router, '/aktuality/novy-clanek?strana=2#galerie');
      await Promise.resolve();

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: 'instant' });
    });

    it('when the first page stays too short, then it is put back as far as it goes once the wait runs out', async () => {
      routerScrollsAfter(startApp().router, '/aktuality/novy-clanek?strana=2');
      await Promise.resolve();

      expect(scrollTo).not.toHaveBeenCalledWith({ top: 1200, behavior: 'instant' });

      vi.advanceTimersByTime(PLACE_WAIT_LONGEST_MS);

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: 'instant' });
    });

    it('when the page starts while the tab is hidden, then the wait runs only once the tab is shown', async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      routerScrollsAfter(startApp().router, '/aktuality/novy-clanek?strana=2');
      await Promise.resolve();
      vi.advanceTimersByTime(PLACE_WAIT_LONGEST_MS);

      expect(scrollTo).not.toHaveBeenCalledWith({ top: 1200, behavior: 'instant' });

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(PLACE_WAIT_LONGEST_MS);

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: 'instant' });
    });

    it('when the visitor touches the page before it is tall enough, then the page stays where the visitor took it', async () => {
      routerScrollsAfter(startApp().router, '/aktuality/novy-clanek?strana=2');
      await Promise.resolve();
      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(PLACE_WAIT_LONGEST_MS);

      expect(scrollTo).not.toHaveBeenCalledWith({ top: 1200, behavior: 'instant' });
    });

    it('when the app starts at another address, then no reading position is put back', async () => {
      pageHeight(5000);
      routerScrollsAfter(startApp().router, '/projekty');
      await Promise.resolve();
      vi.advanceTimersByTime(PLACE_WAIT_LONGEST_MS);

      expect(scrollTo).not.toHaveBeenCalledWith({ top: 1200, behavior: 'instant' });
    });
  });

  it('when the kept place is older than a minute, then the app starts without it', () => {
    keepBeforeReload('/aktuality', 300, new Map<AppTabId, string>([['news', '/aktuality/x']]));
    vi.setSystemTime(START + 60_001);

    const { place } = startApp();

    expect([...place.keptTabs()]).toEqual([]);
    expect(sessionStorage.getItem(RELOAD_PLACE_KEY)).toBeNull();
  });

  it('when a kept page of a tab lies under another tab or outside the site, then only the pages under their own tab are taken', () => {
    sessionStorage.setItem(
      RELOAD_PLACE_KEY,
      JSON.stringify({
        address: '/aktuality',
        top: null,
        tabs: {
          news: '/projekty/sofinka',
          projects: '//elsewhere.example/projekty',
          about: '/o-nas',
          admin: '/sprava',
        },
        at: START,
      }),
    );

    const { place } = startApp();

    expect([...place.keptTabs()]).toEqual([['about', '/o-nas']]);
  });

  it('when the kept place is not one the app wrote, then the app starts without it', () => {
    sessionStorage.setItem(RELOAD_PLACE_KEY, '{"address":7}');

    const { place } = startApp();

    expect([...place.keptTabs()]).toEqual([]);
  });
});
