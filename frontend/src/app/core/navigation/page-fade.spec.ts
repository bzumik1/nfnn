import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivationEnd, NavigationEnd, provideRouter, ResolveStart, Router } from '@angular/router';
import { EMPTY, filter, firstValueFrom, Subject } from 'rxjs';
import { CompactLayout } from '../layout/compact-layout';
import { PAGE_FADE_CLASS, PAGE_FADE_HIDDEN_CLASS, PageFade } from './page-fade';
import { PAGE_LAYER_CLASS, PAGE_TRANSITION_LONGEST_MS } from './page-transitions';
import { ScrollHold } from './scroll-hold';

@Component({ template: '' })
class Blank {}

interface SeenAtArrival {
  readonly covered: boolean;
  readonly opaque: boolean;
  readonly coverHidden: boolean;
  readonly mains: number;
  readonly contentHidden: boolean;
}

let slowPage: Subject<string>;

function computerWith(compact: boolean): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'darce', children: [{ path: 'prehled', component: Blank }] },
        {
          path: '',
          children: [
            { path: '', pathMatch: 'full', component: Blank },
            { path: 'o-nas', component: Blank },
            { path: 'aktuality', component: Blank },
            { path: 'zruseno', component: Blank, resolve: { nothing: () => EMPTY } },
            { path: 'pomalu', component: Blank, resolve: { later: () => slowPage } },
          ],
        },
      ]),
      { provide: CompactLayout, useValue: { isCompact: signal(compact).asReadonly() } },
    ],
  });
}

function cover(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.${PAGE_FADE_CLASS}`);
}

describe('Given a computer that animates, with O nás open', () => {
  let router: Router;
  let layer: HTMLElement;
  let main: HTMLElement;
  let seenAtArrival: SeenAtArrival[];

  function start(compact: boolean): Promise<boolean> {
    computerWith(compact);
    router = TestBed.inject(Router);
    TestBed.inject(PageFade);
    seenAtArrival = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const shown = cover();
        seenAtArrival.push({
          covered: shown !== null,
          opaque: (shown?.style.backgroundColor ?? '') !== '',
          coverHidden:
            shown?.hasAttribute('inert') === true && shown.getAttribute('aria-hidden') === 'true',
          mains: document.querySelectorAll('main').length,
          contentHidden: main.hasAttribute('inert') || main.hasAttribute('aria-hidden'),
        });
      }
    });
    return router.navigateByUrl('/o-nas');
  }

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    main = document.createElement('main');
    main.id = 'obsah';
    main.textContent = 'O nás';
    layer.append(main);
    document.body.append(layer);
    slowPage = new Subject<string>();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll(`.${PAGE_FADE_CLASS}`).forEach((node) => node.remove());
    document.documentElement.classList.remove(PAGE_FADE_HIDDEN_CLASS);
    document.body.style.backgroundColor = '';
    layer.remove();
    vi.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when Aktuality arrives, then an inert still copy of O nás hidden from assistive technology covers the screen, with no second main, and the new content can take the focus at once', async () => {
    await start(false);

    await router.navigateByUrl('/aktuality');

    expect(seenAtArrival.at(-1)).toEqual({
      covered: true,
      opaque: false,
      coverHidden: true,
      mains: 1,
      contentHidden: false,
    });
  });

  it('when the next page is still on its way, then O nás stays as it is, live and not covered', async () => {
    await start(false);
    const resolving = firstValueFrom(router.events.pipe(filter((e) => e instanceof ResolveStart)));
    const opening = router.navigateByUrl('/pomalu');
    await resolving;

    expect(cover()).toBeNull();
    expect(main.hasAttribute('inert') || main.hasAttribute('aria-hidden')).toBe(false);

    slowPage.next('hotovo');
    slowPage.complete();
    await opening;
    expect(seenAtArrival.at(-1)?.covered).toBe(true);
  });

  it('when the copy has faded, then it goes and the scroll the router asked for runs then', async () => {
    await start(false);
    const scrolled = vi.fn();
    vi.useFakeTimers();

    await router.navigateByUrl('/aktuality');
    TestBed.inject(ScrollHold).run(scrolled);
    expect(scrolled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS);

    expect(cover()).toBeNull();
    expect(scrolled).toHaveBeenCalledOnce();
  });

  it('when a pointer is pressed while the copy covers the page, then the new page shows at once and moves only once the press has ended, so the press lands where it was aimed', async () => {
    await start(false);
    vi.useFakeTimers();
    await router.navigateByUrl('/aktuality');
    const scrolled = vi.fn();
    TestBed.inject(ScrollHold).run(scrolled);

    document.dispatchEvent(new Event('pointerdown'));
    expect(cover()).toBeNull();
    expect(document.documentElement.classList).not.toContain(PAGE_FADE_HIDDEN_CLASS);
    expect(scrolled).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('pointerup'));
    await vi.advanceTimersByTimeAsync(0);
    expect(scrolled).toHaveBeenCalledOnce();
  });

  it('when a key is pressed while the copy covers the page, then the new page shows at once', async () => {
    await start(false);
    vi.useFakeTimers();
    await router.navigateByUrl('/aktuality');
    const scrolled = vi.fn();
    TestBed.inject(ScrollHold).run(scrolled);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));

    expect(cover()).toBeNull();
    expect(document.documentElement.classList).not.toContain(PAGE_FADE_HIDDEN_CLASS);
    expect(scrolled).toHaveBeenCalledOnce();
  });

  it('when the account opens from a public page, then the copy hides the navigation of the account until the old content is gone', async () => {
    layer.style.backgroundColor = 'rgb(255, 255, 255)';
    await start(false);

    await router.navigateByUrl('/darce/prehled');

    expect(seenAtArrival.at(-1)).toMatchObject({ covered: true, opaque: true });
  });

  it('when the home page darkens the ground as it arrives, then the old content keeps its own ground until it is gone', async () => {
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    await start(false);
    router.events.subscribe((event) => {
      if (event instanceof ActivationEnd && event.snapshot.routeConfig?.pathMatch === 'full') {
        document.body.style.backgroundColor = 'rgb(18, 24, 38)';
      }
    });

    await router.navigateByUrl('/');

    expect(cover()?.style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('when the page layer starts below the top of the document, then the copy shows the old page where it stood', async () => {
    await start(false);
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -380, 1180, 2000));
    const placed = vi.spyOn(Element.prototype, 'scrollTop', 'set');

    await router.navigateByUrl('/aktuality');

    expect(placed).toHaveBeenCalledWith(380);
    expect(placed).not.toHaveBeenCalledWith(500);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('when the navigation is cancelled, then nothing was covered and the focus stays where it was', async () => {
    await start(false);
    const link = document.createElement('a');
    link.href = '/zruseno';
    link.textContent = 'Zrušeno';
    main.append(link);
    link.focus();

    await router.navigateByUrl('/zruseno');

    expect(cover()).toBeNull();
    expect(main.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(link);
  });

  for (const [name, happen] of [
    ['the window is resized', () => window.dispatchEvent(new Event('resize'))],
    ['the wheel turns', () => document.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))],
  ] as const) {
    it(`when ${name} while the copy covers the page, then the new page shows at once`, async () => {
      await start(false);
      vi.useFakeTimers();
      await router.navigateByUrl('/aktuality');

      happen();

      expect(cover()).toBeNull();
      expect(document.documentElement.classList).not.toContain(PAGE_FADE_HIDDEN_CLASS);
    });
  }

  it('when only the query changes, then nothing covers the page', async () => {
    await start(false);

    await router.navigateByUrl('/o-nas?rok=2025');

    expect(seenAtArrival.at(-1)?.covered).toBe(false);
  });

  it('when the screen is a phone, then the phone transitions are left to themselves', async () => {
    await start(true);

    await router.navigateByUrl('/aktuality');

    expect(seenAtArrival.at(-1)?.covered).toBe(false);
  });
});
