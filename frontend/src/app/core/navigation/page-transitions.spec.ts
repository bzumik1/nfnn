import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  GuardsCheckEnd,
  provideRouter,
  Router,
  RouterOutlet,
  withInMemoryScrolling,
} from '@angular/router';
import { CompactLayout } from '../layout/compact-layout';
import { APP_DEPTH_KEY, BackTarget } from './back-target';
import { ACCOUNT_RETURNS_KEY } from './page-transitions';
import { NavigationPreview } from './navigation-preview';
import {
  PAGE_LAYER_CLASS,
  PAGE_TRANSITION_CLASS,
  PAGE_TRANSITION_LONGEST_MS,
  PageTransitions,
} from './page-transitions';

@Component({ template: '' })
class Blank {}

@Component({
  selector: 'app-scrolled-shell',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class ScrolledShell {}

const jsdomWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');

afterAll(() => {
  expect(Object.getOwnPropertyDescriptor(window, 'innerWidth')).toEqual(jsdomWidth);
});

describe('Given a phone that animates and a page of the news with an article to open', () => {
  let router: Router;
  let layer: HTMLElement;
  let coveredAtGuards: boolean[];

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'aktuality', component: Blank },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    router = TestBed.inject(Router);
    TestBed.inject(PageTransitions);
    coveredAtGuards = [];
    router.events.subscribe((event) => {
      if (event instanceof GuardsCheckEnd) {
        coveredAtGuards.push(document.querySelector(`.${PAGE_TRANSITION_CLASS}`) !== null);
      }
    });
    await router.navigateByUrl('/aktuality');
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}, dialog`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when the article opens, then a still copy of the news covers the screen while it opens', async () => {
    await router.navigateByUrl('/aktuality/clanek');

    expect(coveredAtGuards.at(-1)).toBe(true);
  });

  it('when the article opens while a dialog is still sliding away, then nothing covers the screen', async () => {
    const closing = document.createElement('dialog');
    closing.className = 'dialog dialog--leaving';
    document.body.append(closing);

    await router.navigateByUrl('/aktuality/clanek');

    expect(coveredAtGuards.at(-1)).toBe(false);
  });

  it('when the article opens with a closed dialog left in the page, then the article still slides in', async () => {
    document.body.append(document.createElement('dialog'));

    await router.navigateByUrl('/aktuality/clanek');

    expect(coveredAtGuards.at(-1)).toBe(true);
  });
});

describe('Given the app on the home screen of a phone, scrolling restored, with an article just opened from the news', () => {
  let router: Router;
  let layer: HTMLElement;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: '', component: Blank },
            { path: 'aktuality', component: Blank },
            { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
          ],
          withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
        ),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    router = TestBed.inject(Router);
    TestBed.inject(PageTransitions);
    document.body.append(document.createElement('app-scrolled-shell'));
    TestBed.inject(ApplicationRef).bootstrap(ScrolledShell);
    await router.navigateByUrl('/aktuality');
    vi.useFakeTimers();
    await router.navigateByUrl('/aktuality/clanek');
    await vi.advanceTimersByTimeAsync(100);
  });

  afterEach(() => {
    vi.useRealTimers();
    document
      .querySelectorAll(`.${PAGE_TRANSITION_CLASS}, app-scrolled-shell`)
      .forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when a finger starts dragging it back as soon as it has slid in, then the list stays under the finger past the moment the article would have been revealed', async () => {
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    const swipe = TestBed.inject(PageTransitions).startSwipe(
      TestBed.inject(BackTarget).destination('/aktuality'),
    );

    await vi.advanceTimersByTimeAsync(1000);

    expect(swipe).not.toBeNull();
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}--swipe`)).not.toBeNull();
  });
});

interface Painted {
  readonly title: string;
  readonly back?: boolean;
  readonly tabBar?: boolean;
  readonly sheet?: boolean;
  readonly account?: string;
  readonly head?: string;
}

function paint(layer: HTMLElement, page: Painted): void {
  layer.replaceChildren();
  const header = document.createElement('app-header');
  const bar = document.createElement('header');
  bar.className = 'app-header';
  if (page.back === true) {
    const back = document.createElement('button');
    back.className = 'back-button';
    back.setAttribute('aria-label', 'Zpět');
    bar.append(back);
  }
  if (page.account !== undefined) {
    const account = document.createElement('button');
    account.className = 'account-button';
    account.textContent = page.account;
    bar.append(account);
  }
  header.append(bar);
  const main = document.createElement('main');
  if (page.head !== undefined) {
    const head = document.createElement('app-sheet-head');
    head.textContent = page.head;
    main.append(head);
  }
  const heading = document.createElement('h1');
  heading.textContent = page.title;
  main.append(heading);
  layer.append(header, main);
  if (page.tabBar === true) {
    layer.append(document.createElement('app-tab-bar'));
  }
  if (page.sheet === true) {
    const sheet = document.createElement('dialog');
    sheet.setAttribute('open', '');
    sheet.textContent = 'Účet';
    layer.append(sheet);
  }
}

describe('Given the app on the home screen of a phone, where the news led to the donor overview', () => {
  let router: Router;
  let layer: HTMLElement;
  let transitions: PageTransitions;

  function overlay(): HTMLElement {
    return document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}`)!;
  }

  function under(): HTMLElement {
    return overlay().querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--under`)!;
  }

  function over(): HTMLElement {
    return overlay().querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`)!;
  }

  function barButtons(): HTMLElement[] {
    return Array.from(
      overlay().querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__bar .back-button`),
    );
  }

  function swipeBack() {
    return transitions.startSwipe(TestBed.inject(BackTarget).destination('/'))!;
  }

  async function openOverviewFromTheNews(
    news: Painted,
    overview: Painted,
    sheetReturns = false,
  ): Promise<void> {
    paint(layer, news);
    const depth = TestBed.inject(BackTarget).nextDepth();
    await router.navigateByUrl('/darce/prehled', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: depth, ...(sheetReturns ? { [ACCOUNT_RETURNS_KEY]: '' } : {}) },
    });
    paint(layer, overview);
  }

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'aktuality', component: Blank },
          { path: 'darce/prehled', component: Blank, data: { parent: '/' } },
          { path: 'darce/dary', component: Blank, data: { parent: '/darce/prehled' } },
          { path: 'projekty', component: Blank },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
        {
          provide: NavigationPreview,
          useValue: {
            active: () => false,
            drives: () => false,
            discard: () => undefined,
            visit: () => Promise.resolve(null),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
    transitions = TestBed.inject(PageTransitions);
    await router.navigateByUrl('/aktuality');
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
    Object.defineProperty(window, 'innerWidth', jsdomWidth!);
    vi.restoreAllMocks();
  });

  it('when the overview was opened from the account sheet over the news, then the news without the sheet lies under the finger', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });

    swipeBack();

    expect(under().querySelector('h1')?.textContent).toBe('Aktuality');
    expect(under().querySelector('dialog')).toBeNull();
    expect(over().querySelector('h1')?.textContent).toBe('Přehled');
  });

  it('when the overview was opened from the account sheet, which comes back on the way back, then the news lies under the finger with the account sheet standing over it', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' }, true);

    swipeBack();

    expect(under().querySelector('h1')?.textContent).toBe('Aktuality');
    expect(under().querySelector('dialog')?.textContent).toBe('Účet');
    expect(over().querySelector('dialog')).toBeNull();
  });

  it('when the account sheet comes back on the way back, then the real sheet stays unseen while the page moves and shows once it stands', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' }, true);

    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => ({ finished: Promise.resolve() }),
    });
    try {
      const swipe = swipeBack();
      expect(document.documentElement.classList).toContain(`${PAGE_TRANSITION_CLASS}-sheet-under`);
      await swipe.slideBack();

      expect(document.documentElement.classList).not.toContain(
        `${PAGE_TRANSITION_CLASS}-sheet-under`,
      );
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when both pages are sheets of the administration, then the head of the sheet stands while the pages move and its title changes in place', async () => {
    await openOverviewFromTheNews(
      { title: 'Dárci', head: 'Dárci' },
      { title: 'Jana Nováková', head: 'Jana Nováková' },
    );

    swipeBack().follow(195);

    const heads = barItems('app-sheet-head');
    expect(heads.map((head) => head.textContent)).toEqual(['Dárci', 'Jana Nováková']);
    expect(heads[1].style.opacity).toBe('0.5');
    expect(heads[0].style.opacity).toBe('');
    expect(overlay().classList).toContain(`${PAGE_TRANSITION_CLASS}--heads-held`);
  });

  it('when only the page being left is a sheet, then its head rides with it', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled', head: 'Přehled' });

    swipeBack();

    expect(barItems('app-sheet-head')).toHaveLength(0);
    expect(overlay().classList).not.toContain(`${PAGE_TRANSITION_CLASS}--heads-held`);
  });

  it('when the screen changed its width since the news was left, then the copy of another width is not laid under the finger', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 });

    swipeBack();

    expect(under().querySelector('h1')).toBeNull();
  });

  it('when both pages show the tab bar, then the copies give way to the live tab bar, which stays put above them', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', tabBar: true, sheet: true },
      { title: 'Přehled', tabBar: true },
    );

    swipeBack();

    expect(overlay().classList).toContain(`${PAGE_TRANSITION_CLASS}--under-tab-bar`);
  });

  it('when only the page under the finger shows the tab bar, then the tab bar rides with that page', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', tabBar: true, sheet: true },
      { title: 'Přehled' },
    );

    swipeBack();

    expect(under().querySelector('app-tab-bar')).not.toBeNull();
    expect(overlay().classList).not.toContain(`${PAGE_TRANSITION_CLASS}--under-tab-bar`);
  });

  function barItems(selector: string): HTMLElement[] {
    return Array.from(
      overlay().querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__bar ${selector}`),
    );
  }

  function layerClones(): () => number {
    const original = HTMLElement.prototype.cloneNode;
    let clones = 0;
    vi.spyOn(HTMLElement.prototype, 'cloneNode').mockImplementation(function (
      this: HTMLElement,
      deep?: boolean,
    ) {
      if (this.classList.contains(PAGE_LAYER_CLASS)) {
        clones++;
      }
      return original.call(this, deep);
    });
    return () => clones;
  }

  it('when both pages have the round back button, then one back button stands still above the moving pages', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', back: true, sheet: true },
      { title: 'Přehled', back: true },
    );

    swipeBack().follow(195);

    expect(barButtons()).toHaveLength(1);
    expect(barButtons()[0].style.opacity).toBe('');
  });

  it('when only the page being left has the round back button, then it stays in place and is gone by half the way, as the page Zpět leads to shows its logo there', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', sheet: true },
      { title: 'Přehled', back: true },
    );
    const swipe = swipeBack();

    swipe.follow(97.5);
    expect(barButtons()).toHaveLength(1);
    expect(barButtons()[0].style.opacity).toBe('0.5');
    swipe.follow(195);
    expect(barButtons()[0].style.opacity).toBe('0');
  });

  it('when both pages show the same account circle, then one circle stands still and the copies do not carry their own', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', back: true, account: 'JN', sheet: true },
      { title: 'Přehled', back: true, account: 'JN' },
    );

    swipeBack().follow(195);

    expect(barItems('.account-button')).toHaveLength(1);
    expect(barItems('.account-button')[0].style.opacity).toBe('');
  });

  it('when nothing of the page Zpět leads to is kept, then the tab bar of the page being left stays put, as the page it returns to has one too', async () => {
    paint(layer, { title: 'Přehled', tabBar: true });

    transitions.startSwipe({ kind: 'parent', path: '/' });

    expect(overlay().classList).toContain(`${PAGE_TRANSITION_CLASS}--under-tab-bar`);
  });

  it('when a finger takes the page, then the page is copied once', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });
    const clones = layerClones();

    swipeBack();

    expect(clones()).toBe(1);
  });

  it('when another tab opens, then the page left is not copied, as Zpět never leads back across tabs', async () => {
    paint(layer, { title: 'Aktuality', tabBar: true });
    const clones = layerClones();

    await router.navigateByUrl('/projekty');

    expect(clones()).toBe(0);
  });

  it('when a deeper page opens with a tap and both show alike round back buttons, then that button stands still through the slide', async () => {
    vi.useFakeTimers();
    const seen: string[][] = [];
    const watch = new MutationObserver(() => {
      const moving = document.querySelector(`.${PAGE_TRANSITION_CLASS}--moving`);
      if (moving !== null && seen.length === 0) {
        seen.push(
          Array.from(
            moving.querySelectorAll(`.${PAGE_TRANSITION_CLASS}__bar .back-button`),
            (button) => button.className,
          ),
        );
      }
    });
    try {
      await openOverviewFromTheNews(
        { title: 'Aktuality', sheet: true },
        { title: 'Přehled', back: true },
      );
      watch.observe(document.body, { subtree: true, attributes: true, childList: true });
      const opened = router.navigateByUrl('/darce/dary');
      await vi.advanceTimersByTimeAsync(0);
      paint(layer, { title: 'Moje dary', back: true });
      await opened;
      await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 2);

      expect(seen).toEqual([[`back-button ${PAGE_TRANSITION_CLASS}__bar-item--still`]]);
    } finally {
      watch.disconnect();
      vi.useRealTimers();
    }
  });
});

describe('Given the app on the home screen of a phone opened straight on the donor overview, whose Zpět leads to a page never drawn', () => {
  let layer: HTMLElement;
  let visits: string[];
  let finishVisit: () => void;
  let cannotDraw: () => void;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    document.body.append(layer);
    visits = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'darce/prehled', component: Blank, data: { parent: '/' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
        {
          provide: NavigationPreview,
          useValue: {
            active: () => false,
            discard: () => undefined,
            visit: <T>(path: string, capture: () => T) => {
              visits.push(path);
              return new Promise<T | null>((done) => {
                cannotDraw = () => done(null);
                finishVisit = () => {
                  paint(layer, { title: 'Úvod' });
                  const captured = capture();
                  paint(layer, { title: 'Přehled' });
                  done(captured);
                };
              });
            },
          },
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/darce/prehled');
    paint(layer, { title: 'Přehled' });
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
    Object.defineProperty(window, 'innerWidth', jsdomWidth!);
  });

  function over(): HTMLElement {
    return document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`)!;
  }

  it('when a finger takes the page before the page Zpět leads to is drawn, then the page stays over it, never over an empty ground, and once drawn it catches up with the finger', async () => {
    const swipe = TestBed.inject(PageTransitions).startSwipe({ kind: 'parent', path: '/' })!;

    swipe.follow(120);
    expect(over().style.transform).toBe('');
    finishVisit();
    await Promise.resolve();
    await Promise.resolve();

    expect(over().style.transform).toBe('translateX(120px)');
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)?.classList).toContain(
      `${PAGE_TRANSITION_CLASS}--catching-up`,
    );
  });

  it('when the page Zpět leads to cannot be drawn, then letting go past half leaves the page where it is and says it did not leave', async () => {
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => ({ finished: Promise.resolve() }),
    });
    try {
      const swipe = TestBed.inject(PageTransitions).startSwipe({ kind: 'parent', path: '/' })!;
      swipe.follow(300);
      const left = swipe.settle({
        completes: true,
        from: 300,
        to: 390,
        durationMs: 150,
        easing: 'ease-out',
      });
      cannotDraw();

      expect(await left).toBe(false);
      expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when a finger takes the page, then the page Zpět leads to is drawn under cover and then lies under the finger', async () => {
    TestBed.inject(PageTransitions).startSwipe({ kind: 'parent', path: '/' });
    const under = () =>
      document.querySelector(`.${PAGE_TRANSITION_CLASS}__page--under h1`)?.textContent ?? null;

    expect(visits).toEqual(['/']);
    expect(under()).toBeNull();
    finishVisit();
    await Promise.resolve();

    expect(under()).toBe('Úvod');
  });
});

describe('Given the app on a wide screen, where the header and the side navigation stand beside the content', () => {
  let router: Router;
  let layer: HTMLElement;
  let transitions: PageTransitions;
  let lessMotion: boolean;

  function paintWide(title: string): void {
    layer.replaceChildren();
    const header = document.createElement('app-header');
    const nav = document.createElement('nav');
    for (const [path, name] of [
      ['/', 'Úvod'],
      ['/aktuality', 'Aktuality'],
      ['/projekty', 'Pomáháme'],
    ]) {
      const link = document.createElement('a');
      link.setAttribute('href', path);
      link.textContent = name;
      nav.append(link);
    }
    header.append(nav);
    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.textContent = title;
    const inMain = document.createElement('a');
    inMain.setAttribute('href', '/aktuality/clanek');
    main.append(heading, inMain);
    layer.append(header, main);
  }

  function overlay(): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}`);
  }

  beforeEach(async () => {
    lessMotion = false;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion') && lessMotion,
          media: query,
        }) as MediaQueryList,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'aktuality', component: Blank },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
          { path: 'overit', component: Blank, data: { parent: '/' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(false).asReadonly() } },
        {
          provide: NavigationPreview,
          useValue: {
            active: () => false,
            drives: () => false,
            discard: () => undefined,
            visit: () => Promise.resolve(null),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
    transitions = TestBed.inject(PageTransitions);
    await router.navigateByUrl('/aktuality');
    paintWide('Aktuality');
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
    Object.defineProperty(window, 'innerWidth', jsdomWidth!);
  });

  async function openArticle(): Promise<void> {
    await router.navigateByUrl('/aktuality/clanek');
    paintWide('Zahrada pro děti');
  }

  it('when an article opened from the news is open, then a swipe is a step, and only the content follows the finger over a copy of the news while the header carries no copy of its own', async () => {
    await openArticle();

    expect(transitions.stepsBySwipe()).toBe(true);
    const swipe = transitions.startSwipe(TestBed.inject(BackTarget).destination('/aktuality'));

    expect(swipe).not.toBeNull();
    expect(overlay()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--content`);
    expect(overlay()?.querySelector(`.${PAGE_TRANSITION_CLASS}__page--under h1`)?.textContent).toBe(
      'Aktuality',
    );
    expect(overlay()?.querySelector(`.${PAGE_TRANSITION_CLASS}__bar`)).toBeNull();
  });

  it('when a step without a finger opens the article, then nothing slides, as on a computer today', async () => {
    const covered: boolean[] = [];
    router.events.subscribe((event) => {
      if (event instanceof GuardsCheckEnd) {
        covered.push(overlay() !== null);
      }
    });

    await openArticle();

    expect(covered).toEqual([false]);
  });

  it('when a section of the header is open, then a swipe is no step, as the header switches sections', () => {
    expect(transitions.stepsBySwipe()).toBe(false);
  });

  it('when a page of no section is open, then a swipe is no step', async () => {
    await router.navigateByUrl('/overit');
    paintWide('Ověření');

    expect(transitions.stepsBySwipe()).toBe(false);
  });

  it('when the visitor asks for less motion, then the page does not follow the finger', async () => {
    await openArticle();
    lessMotion = true;

    expect(transitions.stepsBySwipe()).toBe(true);
    expect(transitions.followsFinger()).toBe(false);
  });
});
