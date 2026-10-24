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
