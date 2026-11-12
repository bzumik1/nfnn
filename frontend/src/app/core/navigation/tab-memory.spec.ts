import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy, withInMemoryScrolling } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { APP_TABS, tabOf } from './app-tabs';
import { KeptTabPages } from './kept-tab-pages';
import { TabMemory } from './tab-memory';

@Component({ template: '' })
class Blank {}

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
