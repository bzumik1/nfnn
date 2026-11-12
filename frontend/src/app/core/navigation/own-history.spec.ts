import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import {
  installOwnHistory,
  installOwnHistoryIn,
  OWN_HISTORY_KEY,
  OWN_HISTORY_LIMIT,
} from './own-history';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function popped(): Promise<PopStateEvent> {
  return new Promise((resolve) =>
    window.addEventListener('popstate', (event) => resolve(event), { once: true }),
  );
}

function path(): string {
  return window.location.pathname;
}

let uninstall: () => void = () => undefined;
let storage: MemoryStorage;
let lengthAtStart: number;

beforeEach(() => {
  window.history.replaceState({ start: true }, '', '/start');
  lengthAtStart = window.history.length;
  storage = new MemoryStorage();
});

afterEach(() => {
  uninstall();
  uninstall = () => undefined;
});

describe('Given the site keeping its own history', () => {
  beforeEach(() => {
    uninstall = installOwnHistory(window, storage);
  });

  it('when the app opens three pages, then the browser still holds no entry to swipe back to', () => {
    window.history.pushState({ page: 1 }, '', '/a');
    window.history.pushState({ page: 2 }, '', '/b');
    window.history.pushState({ page: 3 }, '', '/c');

    expect(window.history.length).toBe(lengthAtStart);
    expect(path()).toBe('/c');
    expect(window.history.state).toEqual({ page: 3 });
  });

  it('when the app steps back, then the page before comes back with its state, as after a browser Back', async () => {
    window.history.pushState({ page: 1 }, '', '/a');
    window.history.pushState({ page: 2 }, '', '/b');

    const event = popped();
    window.history.back();
    expect(path()).toBe('/b');

    expect((await event).state).toEqual({ page: 1 });
    expect(path()).toBe('/a');
    expect(window.history.state).toEqual({ page: 1 });
  });

  it('when the app goes two steps back, then it lands two pages back', async () => {
    window.history.pushState({ page: 1 }, '', '/a');
    window.history.pushState({ page: 2 }, '', '/b');
    window.history.pushState({ page: 3 }, '', '/c');

    const event = popped();
    window.history.go(-2);

    expect((await event).state).toEqual({ page: 1 });
    expect(path()).toBe('/a');
  });

  it('when a page replaces its entry, then a step back skips the replaced address', async () => {
    window.history.pushState({ page: 1 }, '', '/a');
    window.history.pushState({ page: 2 }, '', '/b');
    window.history.replaceState({ page: 2.5 }, '', '/b2');

    const event = popped();
    window.history.back();

    expect((await event).state).toEqual({ page: 1 });
    expect(path()).toBe('/a');
  });

  it('when the app is at its first page, then a step back does nothing', async () => {
    const listener = vi.fn();
    window.addEventListener('popstate', listener);

    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 10));
    window.removeEventListener('popstate', listener);

    expect(listener).not.toHaveBeenCalled();
    expect(path()).toBe('/start');
  });

  it('when a step forward is asked, then nothing happens, as a native app has no forward', async () => {
    window.history.pushState({ page: 1 }, '', '/a');
    const listener = vi.fn();
    window.addEventListener('popstate', listener);

    window.history.forward();
    window.history.go(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    window.removeEventListener('popstate', listener);

    expect(listener).not.toHaveBeenCalled();
    expect(path()).toBe('/a');
  });

  it('when the app opens more pages than it keeps, then it keeps the latest ones', async () => {
    for (let page = 1; page <= OWN_HISTORY_LIMIT + 10; page++) {
      window.history.pushState({ page }, '', `/p${page}`);
    }

    const event = popped();
    window.history.go(-(OWN_HISTORY_LIMIT + 20));

    expect((await event).state).toEqual({ page: 11 });
  });

  describe('when the app is reloaded on the same page, as after an update', () => {
    beforeEach(() => {
      window.history.pushState({ page: 1 }, '', '/a');
      window.history.pushState({ page: 2 }, '', '/b');
      uninstall();
      uninstall = installOwnHistory(window, storage);
    });

    it('then a step back still returns to the page before', async () => {
      const event = popped();
      window.history.back();

      expect((await event).state).toEqual({ page: 1 });
      expect(path()).toBe('/a');
    });
  });

  it('when the app starts on another address than the kept history ends at, then it starts afresh', async () => {
    window.history.pushState({ page: 1 }, '', '/a');
    uninstall();
    window.history.replaceState(null, '', '/elsewhere');
    uninstall = installOwnHistory(window, storage);
    const listener = vi.fn();
    window.addEventListener('popstate', listener);

    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 10));
    window.removeEventListener('popstate', listener);

    expect(listener).not.toHaveBeenCalled();
  });

  it('when the kept history in storage is not readable, then the app starts afresh', () => {
    storage.setItem(OWN_HISTORY_KEY, '{not json');
    uninstall();

    expect(() => (uninstall = installOwnHistory(window, storage))).not.toThrow();
  });

  it('when the storage refuses to keep anything, then the history still works in memory', async () => {
    uninstall();
    uninstall = installOwnHistory(window, {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    window.history.pushState({ page: 1 }, '', '/a');

    const event = popped();
    window.history.back();

    expect((await event).state).toEqual({ start: true });
  });
});

describe('Given the site starting in a browser', () => {
  afterEach(() => {
    window.sessionStorage.removeItem(OWN_HISTORY_KEY);
  });

  it('when the app starts, then it keeps its history in the tab’s session storage', () => {
    uninstall = installOwnHistoryIn(window);
    window.history.pushState({ page: 1 }, '', '/a');

    const kept = JSON.parse(window.sessionStorage.getItem(OWN_HISTORY_KEY) ?? '[]') as unknown[];
    expect(kept).toHaveLength(2);
    expect(window.history.length).toBe(lengthAtStart);
  });

  it('when the browser refuses the session storage itself, then the app still keeps its history in memory', async () => {
    const view = Object.create(window, {
      sessionStorage: {
        get: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      },
    }) as Window;
    Object.defineProperty(view, 'history', { value: window.history });
    Object.defineProperty(view, 'location', { value: window.location });

    uninstall = installOwnHistoryIn(view);
    window.history.pushState({ page: 1 }, '', '/a');

    expect(window.history.length).toBe(lengthAtStart);
    expect(path()).toBe('/a');
  });
});

@Component({ template: '' })
class Blank {}

function navigated(router: Router): Promise<void> {
  return new Promise((resolve) => {
    const events = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        events.unsubscribe();
        resolve();
      }
    });
  });
}

describe('Given the router of the site keeping its own history', () => {
  beforeEach(async () => {
    uninstall = installOwnHistory(window, storage);
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    const router = TestBed.inject(Router);
    const started = navigated(router);
    router.initialNavigation();
    await started;
  });

  it('when the visitor opens two pages and the app steps back, then the router shows the page before', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/aktuality');
    await router.navigateByUrl('/aktuality/clanek');

    const returned = navigated(router);
    TestBed.inject(Location).back();
    await returned;

    expect(router.url).toBe('/aktuality');
    expect(window.history.length).toBe(lengthAtStart);
  });
});
