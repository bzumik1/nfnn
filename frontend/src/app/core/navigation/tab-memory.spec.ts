import { Location } from '@angular/common';
import { provideLocationMocks, SpyLocation } from '@angular/common/testing';
import { Component, ProviderToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  InMemoryScrollingFeature,
  NavigationEnd,
  provideRouter,
  Router,
  RouteReuseStrategy,
  Scroll,
  withInMemoryScrolling,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { APP_TABS, tabOf } from './app-tabs';
import { KeptTabPages } from './kept-tab-pages';
import { PagePlacement } from './page-placement';
import { RELOAD_PLACE_KEY, ReloadPlace } from '../reload/reload-place';
import { ScrollHold } from './scroll-hold';
import { TabMemory } from './tab-memory';

@Component({ template: '' })
class Blank {}

function routerScrollerOf(scrolling: InMemoryScrollingFeature): { init(): void } {
  const [scroller] = scrolling.ɵproviders as { provide: ProviderToken<{ init(): void }> }[];
  return TestBed.inject(scroller.provide);
}

const [about, news, projects, donate] = APP_TABS;

describe('Given the tabs of the app', () => {
  it('when a page lies under a tab, then it belongs to that tab', () => {
    expect(tabOf('/aktuality/novy-clanek?x=1')?.id).toBe('news');
    expect(tabOf('/projekty#rok')?.id).toBe('projects');
    expect(tabOf('/o-nas')?.id).toBe('about');
    expect(tabOf('/prispet')?.id).toBe('donate');
  });

  it('when a page lies under no tab, then it belongs to none', () => {
    expect(tabOf('/')).toBeNull();
    expect(tabOf('/darce/prehled')).toBeNull();
    expect(tabOf('/aktualityx')).toBeNull();
  });
});

describe('Given the memory of the tabs', () => {
  let router: Router;
  let memory: TabMemory;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    router = TestBed.inject(Router);
    memory = TestBed.inject(TabMemory);
  });

  it('when no page of a tab was seen yet, then the tab opens its root', () => {
    expect(memory.urlFor(news)).toBe('/aktuality');
  });

  it('when a page deeper in a tab was seen, then another tab returns to it', async () => {
    await router.navigateByUrl('/aktuality/novy-clanek');
    await router.navigateByUrl('/prispet');

    expect(memory.urlFor(news)).toBe('/aktuality/novy-clanek');
    expect(memory.currentTab()?.id).toBe('donate');
  });

  it('when the current tab is pressed, then it opens its root', async () => {
    await router.navigateByUrl('/projekty/sofinka');

    expect(memory.urlFor(projects)).toBe('/projekty');
    expect(memory.isAtRoot(projects)).toBe(false);
  });

  it('when the root of the current tab is shown, then it is at its root', async () => {
    await router.navigateByUrl('/o-nas');

    expect(memory.isAtRoot(about)).toBe(true);
    expect(memory.isAtRoot(donate)).toBe(false);
  });

  it('when a section of a tab was opened, then the tab returns to its page without the section', async () => {
    await router.navigateByUrl('/o-nas#kontakt');
    await router.navigateByUrl('/prispet');

    expect(memory.urlFor(about)).toBe('/o-nas');
  });

  it('when a page outside the tabs is shown, then no tab is current', async () => {
    await router.navigateByUrl('/o-nas');
    await router.navigateByUrl('/darce/prehled');

    expect(memory.currentTab()).toBeNull();
    expect(memory.urlFor(about)).toBe('/o-nas');
  });
});

describe('Given the app loads a new version by itself', () => {
  afterEach(() => sessionStorage.removeItem(RELOAD_PLACE_KEY));

  function startTabs(): { readonly router: Router; readonly memory: TabMemory } {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    return { router: TestBed.inject(Router), memory: TestBed.inject(TabMemory) };
  }

  it('when it reloads, then it keeps the page each tab showed', async () => {
    const { router } = startTabs();
    await router.navigateByUrl('/aktuality/novy-clanek');
    await router.navigateByUrl('/projekty/sofinka');

    TestBed.inject(ReloadPlace).keep('/projekty/sofinka');

    expect(JSON.parse(sessionStorage.getItem(RELOAD_PLACE_KEY) ?? '{}').tabs).toEqual({
      news: '/aktuality/novy-clanek',
      projects: '/projekty/sofinka',
    });
  });

  it('when it has started again, then each tab returns to the page it showed before', async () => {
    sessionStorage.setItem(
      RELOAD_PLACE_KEY,
      JSON.stringify({
        address: '/prispet',
        top: null,
        tabs: { news: '/aktuality/novy-clanek' },
        at: Date.now(),
      }),
    );
    const { router, memory } = startTabs();

    await router.navigateByUrl('/prispet');

    expect(memory.urlFor(news)).toBe('/aktuality/novy-clanek');
    expect(memory.urlFor(projects)).toBe('/projekty');
  });
});

describe('Given pages of the tabs kept while the visitor is away', () => {
  let harness: RouterTestingHarness;
  let memory: TabMemory;
  let scrolledTo: ScrollToOptions[];

  beforeEach(async () => {
    scrolledTo = [];
    vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number) => {
      if (typeof options === 'object') {
        scrolledTo.push(options);
      }
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          APP_TABS.map((tab) => ({ path: tab.path.slice(1), component: Blank })),
          withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
        ),
        { provide: RouteReuseStrategy, useExisting: KeptTabPages },
      ],
    });
    memory = TestBed.inject(TabMemory);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  function scrolledBy(top: number): void {
    Object.defineProperty(window, 'scrollY', { value: top, configurable: true });
  }

  async function navigateAndRender(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    TestBed.tick();
  }

  it('when the visitor switches back by the tab bar, then the tab opens where they left it, at once and without the router scrolling', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    await harness.navigateByUrl('/aktuality');
    scrolledBy(420);
    await memory.open(APP_TABS[0]);
    scrolledBy(0);
    scrolledTo = [];

    await memory.open(APP_TABS[1]);
    TestBed.tick();

    expect(navigate).toHaveBeenLastCalledWith('/aktuality', { scroll: 'manual' });
    expect(scrolledTo).toEqual([
      { top: 420, behavior: 'instant' },
      { top: 420, behavior: 'instant' },
    ]);
  });

  it('when the visitor opens a tab not seen before, then it opens at its top', async () => {
    await harness.navigateByUrl('/aktuality');
    scrolledBy(420);

    await memory.open(APP_TABS[2]);
    TestBed.tick();

    expect(scrolledTo.at(-1)).toEqual({ top: 0, behavior: 'instant' });
  });

  it('when a link leads back to a kept page, then it is put back where it was left, at once', async () => {
    await harness.navigateByUrl('/aktuality');
    scrolledBy(420);
    await navigateAndRender('/o-nas');
    scrolledBy(0);

    await navigateAndRender('/aktuality');

    expect(scrolledTo.at(-1)).toEqual({ top: 420, behavior: 'instant' });
  });

  it('when a link opens a page that is not kept, then it starts at its top in its first frame, without sliding there through the smooth scrolling of the page', async () => {
    await harness.navigateByUrl('/aktuality');
    scrolledBy(420);
    scrolledTo = [];

    await navigateAndRender('/projekty');

    expect(scrolledTo).toEqual([{ top: 0, behavior: 'instant' }]);
  });

  it('when the content fades through on a computer, then a page that is not kept goes to its top only when the fade lets it', async () => {
    await harness.navigateByUrl('/aktuality');
    scrolledBy(420);
    scrolledTo = [];
    const hold = TestBed.inject(ScrollHold);
    hold.hold();

    await navigateAndRender('/projekty');
    expect(scrolledTo).toEqual([]);
    hold.release();

    expect(scrolledTo).toEqual([{ top: 0, behavior: 'instant' }]);
  });

  it('when the content fades through to a kept page, then it is put back where it was left only when the fade lets it', async () => {
    await harness.navigateByUrl('/aktuality');
    scrolledBy(420);
    await navigateAndRender('/o-nas');
    scrolledBy(0);
    scrolledTo = [];
    const hold = TestBed.inject(ScrollHold);
    hold.hold();

    await navigateAndRender('/aktuality');
    expect(scrolledTo).toEqual([]);
    hold.release();

    expect(scrolledTo).toEqual([{ top: 420, behavior: 'instant' }]);
  });

  it('when only the query of a page changes, such as the next page of a list, then it starts at its top at once too', async () => {
    await harness.navigateByUrl('/aktuality');
    scrolledBy(420);
    scrolledTo = [];

    await navigateAndRender('/aktuality?strana=2');

    expect(scrolledTo).toEqual([{ top: 0, behavior: 'instant' }]);
  });

  it('when a navigation asks to keep its place, as a filter of a list does, then the page is not moved', async () => {
    await harness.navigateByUrl('/projekty');
    scrolledBy(420);
    scrolledTo = [];

    await TestBed.inject(Router).navigateByUrl('/projekty?rok=2024', { scroll: 'manual' });
    TestBed.tick();

    expect(scrolledTo).toEqual([]);
  });

  it('when a link leads to a section of a kept page, then the page is left to the section rather than put back where it was', async () => {
    await harness.navigateByUrl('/o-nas');
    scrolledBy(420);
    await navigateAndRender('/aktuality');
    scrolledTo = [];

    await navigateAndRender('/o-nas#kontakt');

    expect(scrolledTo).not.toContainEqual({ top: 420, behavior: 'instant' });
  });

  it('when the kept pages were let go, then the tab opens at its top', async () => {
    await harness.navigateByUrl('/aktuality');
    scrolledBy(420);
    await memory.open(APP_TABS[0]);
    TestBed.inject(KeptTabPages).forget();
    scrolledBy(0);

    await memory.open(APP_TABS[1]);
    TestBed.tick();

    expect(scrolledTo.at(-1)).toEqual({ top: 0, behavior: 'instant' });
  });
});

describe('Given a visitor who goes back through the history of the browser', () => {
  let harness: RouterTestingHarness;
  let scrolledTo: ScrollToOptions[];

  beforeEach(async () => {
    scrolledTo = [];
    vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number) => {
      if (typeof options === 'object') {
        scrolledTo.push(options);
      }
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          APP_TABS.map((tab) => ({ path: tab.path.slice(1), component: Blank })),
          withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
        ),
        provideLocationMocks(),
      ],
    });
    TestBed.inject(TabMemory);
    harness = await RouterTestingHarness.create();
    TestBed.inject(Router).setUpLocationChangeListener();
  });

  afterEach(() => vi.restoreAllMocks());

  it('when the page comes back, then it is not sent to its top when it opens, so the router can put it back where it was', async () => {
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/projekty');
    scrolledTo = [];
    const ended = new Promise<void>((done) =>
      TestBed.inject(Router).events.subscribe((event) => {
        if (event instanceof NavigationEnd) {
          done();
        }
      }),
    );

    (TestBed.inject(Location) as SpyLocation).simulateUrlPop('/o-nas');
    await ended;
    TestBed.tick();

    expect(scrolledTo).toEqual([]);
  });
});

describe('Given a visitor who steps back to a page drawn afresh, shorter at first than the place they left', () => {
  let harness: RouterTestingHarness;
  let scrolledTo: number[];
  let grown: (() => void) | null;
  let placed: HTMLElement[];

  function scrolledBy(top: number): void {
    Object.defineProperty(window, 'scrollY', { value: top, configurable: true });
  }

  function pageHeight(height: number): void {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: height,
      configurable: true,
    });
  }

  function grows(height: number): void {
    pageHeight(height);
    grown?.();
  }

  function farthestPlace(): number {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  beforeEach(async () => {
    scrolledTo = [];
    grown = null;
    placed = [];
    vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number) => {
      if (typeof options === 'object') {
        const top = Math.min(options.top ?? 0, farthestPlace());
        scrolledBy(top);
        scrolledTo.push(top);
      }
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly observe = vi.fn();

        constructor(changed: () => void) {
          grown = changed;
        }

        disconnect(): void {
          grown = null;
        }
      },
    );
    const scrolling = withInMemoryScrolling({ scrollPositionRestoration: 'enabled' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            ...APP_TABS.map((tab) => ({ path: tab.path.slice(1), component: Blank })),
            { path: 'sprava', component: Blank },
          ],
          scrolling,
        ),
        provideLocationMocks(),
      ],
    });
    TestBed.inject(TabMemory);
    routerScrollerOf(scrolling).init();
    harness = await RouterTestingHarness.create('/o-nas');
    TestBed.inject(Router).setUpLocationChangeListener();
    pageHeight(3000);
    scrolledBy(900);
    await untilScrolled(() => harness.navigateByUrl('/sprava'));
    scrolledBy(0);
    pageHeight(300);
    scrolledTo = [];
  });

  afterEach(() => {
    placed.forEach((element) => element.remove());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrolledBy(0);
    pageHeight(0);
  });

  async function untilScrolled(act: () => unknown): Promise<void> {
    const router = TestBed.inject(Router);
    const shown = router.lastSuccessfulNavigation()?.id ?? 0;
    const scrolled = new Promise<void>((done) =>
      router.events.subscribe((event) => {
        if (event instanceof Scroll && event.routerEvent.id > shown) {
          queueMicrotask(done);
        }
      }),
    );
    await act();
    await scrolled;
    await vi.dynamicImportSettled();
  }

  function stepBack(): Promise<void> {
    return untilScrolled(() => TestBed.inject(Location).back());
  }

  function focusedHeadingAt(top: number): void {
    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.tabIndex = -1;
    main.append(heading);
    document.body.append(main);
    placed.push(main);
    vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: top - window.scrollY, width: 300, height: 40 }),
    );
    heading.focus();
  }

  it('when the page grows tall enough, then it is put where they left it', async () => {
    await stepBack();
    scrolledTo = [];
    grows(3000);

    expect(scrolledTo).toEqual([900]);
  });

  it('when the page is already tall enough once it is drawn, then it is put where they left it once, and a notice that grows above the place later moves it no more', async () => {
    pageHeight(3000);
    await stepBack();
    expect(scrolledTo.at(-1)).toBe(900);

    scrolledBy(942);
    scrolledTo = [];
    grows(3042);

    expect(scrolledTo).toEqual([]);
    expect(window.scrollY).toBe(942);
  });

  function placedYet(): () => boolean {
    let placed = false;
    void TestBed.inject(PagePlacement)
      .placed(window, 60_000)
      .then(() => (placed = true));
    return () => placed;
  }

  async function settledPromises(): Promise<void> {
    await new Promise<void>((done) => setTimeout(done));
  }

  it('when the page has not grown yet, then the cover of the step back waits, and lifts once the page is put where they left it', async () => {
    await stepBack();
    const placed = placedYet();
    await settledPromises();
    expect(placed()).toBe(false);

    grows(3000);
    await settledPromises();

    expect(scrolledTo.at(-1)).toBe(900);
    expect(placed()).toBe(true);
  });

  it('when the visitor moves before the page grows, then the cover of the step back waits no longer', async () => {
    await stepBack();
    const placed = placedYet();
    window.dispatchEvent(new Event('touchstart'));
    await settledPromises();

    expect(placed()).toBe(true);
  });

  it('when the page grows in two steps, then it moves once, from where it opened straight to where they left it', async () => {
    await stepBack();
    grows(1200);
    grows(3000);

    expect([...new Set(scrolledTo)]).toEqual([0, 900]);
  });

  it('when the visitor touches the page before it grows, then the page is left where they put it', async () => {
    await stepBack();
    window.dispatchEvent(new Event('touchstart'));
    scrolledTo = [];
    grows(3000);

    expect(scrolledTo).toEqual([]);
  });

  it('when the focus moves before it grows, as a screen reader moves it, then the page is left where the focus took it', async () => {
    await stepBack();
    document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    scrolledTo = [];
    grows(3000);

    expect(scrolledTo).toEqual([]);
  });

  it('when the page is scrolled by something else than the app before it grows, as by a scroll bar or three fingers of VoiceOver, then it is left there', async () => {
    await stepBack();
    scrolledBy(120);
    window.dispatchEvent(new Event('scroll'));
    scrolledTo = [];
    grows(3000);

    expect(scrolledTo).toEqual([]);
  });

  it('when the heading holding the focus would leave the screen by the move, then the page stays where the heading is seen', async () => {
    focusedHeadingAt(80);
    await stepBack();
    scrolledTo = [];
    grows(3000);

    expect(scrolledTo).toEqual([]);
  });

  it('when the content fades through on a computer, then the page waits for the fade to let the scroll go and is put where they left it only then', async () => {
    const hold = TestBed.inject(ScrollHold);
    hold.hold();
    await stepBack();
    scrolledTo = [];
    grows(3000);
    expect(scrolledTo).toEqual([]);

    hold.release();

    expect(scrolledTo).toEqual([900]);
  });

  it('when another page opens before it grows, then that page is not moved', async () => {
    await stepBack();
    scrolledTo = [];
    await harness.navigateByUrl('/projekty');
    scrolledTo = [];
    grows(3000);

    expect(scrolledTo).not.toContain(900);
  });
});
