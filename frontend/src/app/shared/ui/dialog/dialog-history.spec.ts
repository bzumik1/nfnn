import { BrowserPlatformLocation, Location, PlatformLocation } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Event as RouterEvent, provideRouter, Router } from '@angular/router';
import { DialogHistory, DialogHistoryListener } from './dialog-history';

@Component({ template: '' })
class Page {}

describe('Given the history entries of an open dialog', () => {
  let history: DialogHistory;
  let router: Router;
  let location: Location;
  let listener: { stepBack: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let routerEvents: RouterEvent[];

  const settled = async (): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      TestBed.tick();
    }
  };
  const back = async (steps = 1): Promise<void> => {
    window.history.go(-steps);
    await settled();
  };
  const depth = (): unknown =>
    (window.history.state as Record<string, unknown> | null)?.['nfnnDialogDepth'];

  beforeEach(async () => {
    window.history.pushState(null, '', '/');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'stranka', component: Page },
          { path: 'jinam', component: Page },
        ]),
        { provide: PlatformLocation, useClass: BrowserPlatformLocation },
      ],
    });
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    router.initialNavigation();
    await router.navigateByUrl('/stranka');
    await settled();
    history = TestBed.inject(DialogHistory);
    listener = { stepBack: vi.fn(), close: vi.fn() };
    routerEvents = [];
    router.events.subscribe((event) => routerEvents.push(event));
  });

  const open = async (): Promise<void> => {
    history.open(listener as DialogHistoryListener);
    await settled();
  };

  it('when the dialog opens, then it adds one entry for the same page', async () => {
    const before = window.history.length;

    await open();

    expect(window.history.length).toBe(before + 1);
    expect(depth()).toBe(1);
    expect(location.path()).toBe('/stranka');
  });

  it('when the visitor goes back, then the dialog is told to close, the page stays and the router hears nothing', async () => {
    await open();

    await back();

    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(listener.stepBack).not.toHaveBeenCalled();
    expect(depth()).toBeUndefined();
    expect(location.path()).toBe('/stranka');
    expect(routerEvents).toEqual([]);
  });

  it('when the dialog closes by itself, then its entry is taken back without the router noticing', async () => {
    await open();

    history.close();
    await settled();

    expect(depth()).toBeUndefined();
    expect(location.path()).toBe('/stranka');
    expect(listener.close).not.toHaveBeenCalled();
    expect(routerEvents).toEqual([]);
  });

  it('when a dialog that another one has since replaced closes, then the entry of the open one stays', async () => {
    const replaced = { stepBack: vi.fn(), close: vi.fn() };
    history.open(replaced);
    await open();

    history.close(replaced);
    await settled();

    expect(depth()).toBe(1);
    await back();
    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(replaced.close).not.toHaveBeenCalled();
  });

  it('when the visitor goes forward onto the entry of a closed dialog and opens another, then Back closes the new one', async () => {
    await open();
    history.close();
    await settled();
    window.history.go(1);
    await settled();

    await open();
    await back();

    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(location.path()).toBe('/stranka');
    await back();
    expect(location.path()).toBe('');
  });

  describe('when a second dialog opens over the first', () => {
    let upper: { stepBack: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
      await open();
      upper = { stepBack: vi.fn(), close: vi.fn() };
      history.open(upper as DialogHistoryListener);
      await settled();
    });

    it('then each has an entry of its own, Back closes only the upper one and the next Back the first', async () => {
      expect(depth()).toBe(2);

      await back();

      expect(upper.close).toHaveBeenCalledTimes(1);
      expect(listener.close).not.toHaveBeenCalled();
      expect(depth()).toBe(1);
      await back();
      expect(listener.close).toHaveBeenCalledTimes(1);
      expect(depth()).toBeUndefined();
      expect(location.path()).toBe('/stranka');
      expect(routerEvents).toEqual([]);
    });

    it('and the first closes by itself, then the upper one keeps its entry and Back closes it', async () => {
      history.close(listener as DialogHistoryListener);
      await settled();

      expect(depth()).toBe(1);
      await back();
      expect(upper.close).toHaveBeenCalledTimes(1);
      expect(listener.close).not.toHaveBeenCalled();
      expect(location.path()).toBe('/stranka');
    });

    it('and the upper one moves on to a further step, then Back returns to its step before and leaves the first open', async () => {
      history.showStep(1);
      await settled();
      expect(depth()).toBe(3);

      await back();

      expect(upper.stepBack).toHaveBeenCalledTimes(1);
      expect(upper.close).not.toHaveBeenCalled();
      expect(depth()).toBe(2);
    });

    it('and the visitor goes back past both at once, then both are told to close, the upper one first', async () => {
      const order: string[] = [];
      upper.close.mockImplementation(() => order.push('upper'));
      listener.close.mockImplementation(() => order.push('first'));

      await back(2);

      expect(order).toEqual(['upper', 'first']);
      expect(location.path()).toBe('/stranka');
    });

    it('and the visitor goes back past both while each takes its own entry back on closing, then no entry is added again', async () => {
      upper.close.mockImplementation(() => history.close(upper as DialogHistoryListener));
      listener.close.mockImplementation(() => history.close(listener as DialogHistoryListener));
      const length = window.history.length;

      await back(2);

      expect(upper.close).toHaveBeenCalledTimes(1);
      expect(listener.close).toHaveBeenCalledTimes(1);
      expect(window.history.length).toBe(length);
      expect(depth()).toBeUndefined();
      expect(location.path()).toBe('/stranka');
    });

    it('and the first moves on to a further step under the upper one, then Back still closes the upper one first', async () => {
      history.showStep(1, listener as DialogHistoryListener);
      await settled();
      expect(depth()).toBe(3);

      await back();

      expect(upper.close).toHaveBeenCalledTimes(1);
      expect(listener.stepBack).not.toHaveBeenCalled();
      await back();
      expect(listener.stepBack).toHaveBeenCalledTimes(1);
      expect(listener.close).not.toHaveBeenCalled();
    });
  });

  it('when one dialog closes and another opens in the same moment, then Back closes only the new one and stays on the page', async () => {
    await open();
    const sheet = { stepBack: vi.fn(), close: vi.fn() };

    history.close(listener as DialogHistoryListener);
    history.open(sheet);
    await settled();

    expect(depth()).toBe(1);
    await back();
    expect(sheet.close).toHaveBeenCalledTimes(1);
    expect(listener.close).not.toHaveBeenCalled();
    expect(location.path()).toBe('/stranka');
    expect(routerEvents).toEqual([]);
  });

  it('when the dialog closes before it ever added an entry, then history is left alone', async () => {
    const before = window.history.length;

    history.close();
    await settled();

    expect(window.history.length).toBe(before);
  });

  describe('when the dialog moves on to a further step', () => {
    beforeEach(async () => {
      await open();
      history.showStep(1);
      await settled();
    });

    it('then that step has an entry of its own, and going back returns to the step before', async () => {
      expect(depth()).toBe(2);

      await back();

      expect(listener.stepBack).toHaveBeenCalledTimes(1);
      expect(listener.close).not.toHaveBeenCalled();
      expect(depth()).toBe(1);
    });

    it('and the dialog goes back a step by itself, then the step entry is taken back', async () => {
      history.showStep(0);
      await settled();

      expect(depth()).toBe(1);
      expect(listener.stepBack).not.toHaveBeenCalled();
    });

    it('and the dialog closes, then every entry it added is taken back at once', async () => {
      history.close();
      await settled();

      expect(depth()).toBeUndefined();
      expect(location.path()).toBe('/stranka');
    });
  });

  it('when the visitor goes back twice, then the dialog closes first and the earlier page opens next', async () => {
    await router.navigateByUrl('/jinam');
    await open();

    await back();
    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(location.path()).toBe('/jinam');
    await back();

    expect(location.path()).toBe('/stranka');
    await vi.waitFor(() => expect(router.url).toBe('/stranka'));
  });

  it('when the dialog hands over to the page it was opened for, then that page takes its entry and Back returns to the page under it', async () => {
    await open();
    const length = window.history.length;

    history.handOver('/jinam');
    await router.navigateByUrl('/jinam');
    await settled();

    expect(window.history.length).toBe(length);
    expect(location.path()).toBe('/jinam');
    await back();
    expect(location.path()).toBe('/stranka');
    expect(listener.close).not.toHaveBeenCalled();
  });

  it('when the dialog hands over before it ever added an entry, then the page under it keeps its entry', () => {
    history.handOver('/jinam');

    expect(location.path()).toBe('/stranka');
  });

  it('when a link in the dialog replaces its entry with another page, then nothing is taken back', async () => {
    await open();
    const length = window.history.length;

    history.release();
    await router.navigateByUrl('/jinam', { replaceUrl: true });
    await settled();

    expect(window.history.length).toBe(length);
    expect(location.path()).toBe('/jinam');
  });

  it('when another page opens while the dialog is open, then closing it later never leaves that page', async () => {
    await open();

    await router.navigateByUrl('/jinam');
    history.close();
    await settled();

    expect(location.path()).toBe('/jinam');
  });

  it('when the dialog is opened during a navigation, then its entry waits until the page has opened', async () => {
    const navigation = router.navigateByUrl('/jinam');
    history.open(listener as DialogHistoryListener);
    await navigation;
    await settled();

    expect(location.path()).toBe('/jinam');
    expect(depth()).toBe(1);
    await back();
    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(location.path()).toBe('/jinam');
  });
});

describe('Given a page reloaded while a dialog had its entry open', () => {
  let router: Router;
  let location: Location;
  let routerEvents: RouterEvent[];

  const settled = async (): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      TestBed.tick();
    }
  };

  beforeEach(async () => {
    window.history.pushState(null, '', '/');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'stranka', component: Page },
        ]),
        { provide: PlatformLocation, useClass: BrowserPlatformLocation },
      ],
    });
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    router.initialNavigation();
    await router.navigateByUrl('/stranka');
    await settled();
    window.history.pushState({ ...window.history.state, nfnnDialogDepth: 1 }, '');
    routerEvents = [];
    router.events.subscribe((event) => routerEvents.push(event));
  });

  it('when the history of dialogs starts, then it takes the stale entry back without the router noticing, so the next Back leaves the page', async () => {
    TestBed.inject(DialogHistory);
    await settled();

    expect(
      (window.history.state as Record<string, unknown> | null)?.['nfnnDialogDepth'],
    ).toBeUndefined();
    expect(location.path()).toBe('/stranka');
    expect(routerEvents).toEqual([]);
    window.history.go(-1);
    await settled();
    expect(location.path()).toBe('');
  });
});

describe('Given a page reloaded while a dialog had its entry open, whose route loads only after a while', () => {
  const settled = async (): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      TestBed.tick();
    }
  };

  it('when the app starts, then the router never copies the stale mark, so a dialog opened later still closes on Back without leaving the page', async () => {
    window.history.pushState(null, '', '/');
    window.history.pushState(null, '', '/stranka');
    window.history.pushState({ nfnnDialogDepth: 1 }, '', '/stranka');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          {
            path: 'stranka',
            loadComponent: () =>
              new Promise<typeof Page>((resolve) => setTimeout(() => resolve(Page), 40)),
          },
        ]),
        { provide: PlatformLocation, useClass: BrowserPlatformLocation },
      ],
    });
    const history = TestBed.inject(DialogHistory);
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    router.initialNavigation();
    await vi.waitFor(() => expect(router.navigated).toBe(true));
    await settled();
    const listener = { stepBack: vi.fn(), close: vi.fn() };

    history.open(listener);
    await settled();
    window.history.go(-1);
    await settled();

    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(location.path()).toBe('/stranka');
  });
});
