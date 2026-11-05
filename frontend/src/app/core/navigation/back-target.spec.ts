import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { APP_DEPTH_KEY, BackTarget } from './back-target';

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

describe('Given the back target of the app', () => {
  let router: Router;
  let back: BackTarget;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    TestBed.inject(Location).replaceState('/aktuality/clanek');
    router = TestBed.inject(Router);
    back = TestBed.inject(BackTarget);
    const started = navigated(router);
    router.initialNavigation();
    await started;
  });

  it('when the app starts on a deep link, then there is nothing of the app to go back to', () => {
    expect(back.canGoBack).toBe(false);
  });

  it('when the app starts on a deep link and back is pressed, then it replaces the entry with the parent', async () => {
    const replaced = navigated(router);
    back.back('/aktuality');
    await replaced;

    expect(router.url).toBe('/aktuality');
    expect(back.canGoBack).toBe(false);
  });

  describe('when the visitor opens another page of the app', () => {
    beforeEach(async () => {
      await router.navigateByUrl('/aktuality/druhy');
    });

    it('then back returns to the page before', async () => {
      expect(back.canGoBack).toBe(true);

      const returned = navigated(router);
      back.back('/aktuality');
      await returned;

      expect(router.url).toBe('/aktuality/clanek');
      expect(back.canGoBack).toBe(false);
    });

    it('then the depth is kept in the entry, so a reload still knows it', () => {
      expect((TestBed.inject(Location).getState() as Record<string, unknown>)[APP_DEPTH_KEY]).toBe(
        1,
      );
    });

    it('and the page is replaced, then the depth stays', async () => {
      await router.navigateByUrl('/aktuality/treti', { replaceUrl: true });

      expect((TestBed.inject(Location).getState() as Record<string, unknown>)[APP_DEPTH_KEY]).toBe(
        1,
      );
      expect(back.canGoBack).toBe(true);
    });
  });

  describe('when the visitor leaves a deep page for another tab and its tab opens that page again', () => {
    beforeEach(async () => {
      await router.navigateByUrl('/projekty');
      await router.navigateByUrl('/aktuality/clanek');
    });

    it('then back opens the parent within the tab instead of the other tab', async () => {
      const replaced = navigated(router);
      back.back('/aktuality');
      await replaced;

      expect(router.url).toBe('/aktuality');
    });
  });

  it('when back returns to the page before, then the app knows the return came from its own button', async () => {
    await router.navigateByUrl('/aktuality/druhy');
    expect(back.returningByButton).toBe(false);

    const returned = navigated(router);
    back.back('/aktuality');
    await returned;

    expect(back.returningByButton).toBe(true);

    await router.navigateByUrl('/aktuality/druhy');

    expect(back.returningByButton).toBe(false);
  });

  it("when the browser returns by itself, then the return is not the app's button", async () => {
    await router.navigateByUrl('/aktuality/druhy');

    const returned = navigated(router);
    TestBed.inject(Location).back();
    await returned;

    expect(back.returningByButton).toBe(false);
  });

  it('when a dialog hands its entry over to a page, then that page counts one level deeper', async () => {
    await router.navigateByUrl('/darce/prehled', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: back.nextDepth() },
    });

    expect(back.canGoBack).toBe(true);
  });

  it('when the app starts again on an entry it made, then back still returns within the app', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    TestBed.inject(Location).replaceState('/aktuality/clanek', '', { [APP_DEPTH_KEY]: 2 });
    const restarted = TestBed.inject(BackTarget);
    const started = navigated(TestBed.inject(Router));

    TestBed.inject(Router).initialNavigation();
    await started;

    expect(restarted.canGoBack).toBe(true);
  });
});
