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
import { PAGE_LAYER_CLASS, PAGE_TRANSITION_CLASS, PageTransitions } from './page-transitions';

@Component({ template: '' })
class Blank {}

@Component({
  selector: 'app-scrolled-shell',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class ScrolledShell {}

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
  header.append(bar);
  const main = document.createElement('main');
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

  async function openOverviewFromTheNews(news: Painted, overview: Painted): Promise<void> {
    paint(layer, news);
    const depth = TestBed.inject(BackTarget).nextDepth();
    await router.navigateByUrl('/darce/prehled', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: depth },
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
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
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
    delete (window as { innerWidth?: number }).innerWidth;
  });

  it('when the overview was opened from the account sheet over the news, then the news without the sheet lies under the finger', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });

    swipeBack();

    expect(under().querySelector('h1')?.textContent).toBe('Aktuality');
    expect(under().querySelector('dialog')).toBeNull();
    expect(over().querySelector('h1')?.textContent).toBe('Přehled');
  });

  it('when the screen changed its width since the news was left, then the copy of another width is not laid under the finger', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 });

    swipeBack();

    expect(under().querySelector('h1')).toBeNull();
  });

  it('when both pages show the tab bar, then it is left out of both copies and the live tab bar stays put above them', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', tabBar: true, sheet: true },
      { title: 'Přehled', tabBar: true },
    );

    swipeBack();

    expect(overlay().querySelector('app-tab-bar')).toBeNull();
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

  it('when both pages have the round back button, then one back button stands still above the moving pages', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', back: true, sheet: true },
      { title: 'Přehled', back: true },
    );

    swipeBack().follow(195);

    expect(barButtons()).toHaveLength(1);
    expect(
      barButtons()[0].closest<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__bar-part`)!.style.opacity,
    ).toBe('');
  });

  it('when only the page being left has the round back button, then it stays in place and fades as the finger goes across', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', sheet: true },
      { title: 'Přehled', back: true },
    );

    swipeBack().follow(195);

    expect(barButtons()).toHaveLength(1);
    expect(
      barButtons()[0].closest<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__bar-part`)!.style.opacity,
    ).toBe('0.5');
  });
});
