import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GuardsCheckEnd, NavigationEnd, provideRouter, Router } from '@angular/router';
import { CompactLayout } from '../layout/compact-layout';
import { PAGE_FADE_CLASS, PAGE_FADE_HIDDEN_CLASS, PageFade } from './page-fade';
import { PAGE_LAYER_CLASS, PAGE_TRANSITION_LONGEST_MS } from './page-transitions';
import { ScrollHold } from './scroll-hold';

@Component({ template: '' })
class Blank {}

interface SeenAtGuards {
  readonly covered: boolean;
  readonly opaque: boolean;
  readonly coverHidden: boolean;
  readonly mainHidden: boolean;
}

function computerWith(compact: boolean): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'darce', children: [{ path: 'prehled', component: Blank }] },
        {
          path: '',
          children: [
            { path: 'o-nas', component: Blank },
            { path: 'aktuality', component: Blank },
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
  let seenAtGuards: SeenAtGuards[];
  let mainInertAtEnd: boolean[];

  function start(compact: boolean): Promise<boolean> {
    computerWith(compact);
    router = TestBed.inject(Router);
    TestBed.inject(PageFade);
    seenAtGuards = [];
    mainInertAtEnd = [];
    router.events.subscribe((event) => {
      if (event instanceof GuardsCheckEnd) {
        const shown = cover();
        seenAtGuards.push({
          covered: shown !== null,
          opaque:
            (shown?.querySelector<HTMLElement>(`.${PAGE_FADE_CLASS}__copy`)?.style
              .backgroundColor ?? '') !== '',
          coverHidden:
            shown?.hasAttribute('inert') === true && shown.getAttribute('aria-hidden') === 'true',
          mainHidden: main.hasAttribute('inert') && main.getAttribute('aria-hidden') === 'true',
        });
      } else if (event instanceof NavigationEnd) {
        mainInertAtEnd.push(main.hasAttribute('inert'));
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
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll(`.${PAGE_FADE_CLASS}`).forEach((node) => node.remove());
    document.documentElement.classList.remove(PAGE_FADE_HIDDEN_CLASS);
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when Aktuality opens, then a still copy hidden from assistive technology covers the old content, which is inert and hidden too', async () => {
    await start(false);

    await router.navigateByUrl('/aktuality');

    expect(seenAtGuards.at(-1)).toEqual({
      covered: true,
      opaque: false,
      coverHidden: true,
      mainHidden: true,
    });
    expect(main.hasAttribute('inert')).toBe(false);
  });

  it('when Aktuality arrives, then its content can take the focus before anything fades', async () => {
    await start(false);

    await router.navigateByUrl('/aktuality');

    expect(mainInertAtEnd.at(-1)).toBe(false);
    expect(main.hasAttribute('aria-hidden')).toBe(false);
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

    expect(seenAtGuards.at(-1)).toEqual({
      covered: true,
      opaque: true,
      coverHidden: true,
      mainHidden: true,
    });
  });

  it('when only the query changes, then nothing covers the page', async () => {
    await start(false);

    await router.navigateByUrl('/o-nas?rok=2025');

    expect(seenAtGuards.at(-1)).toEqual({
      covered: false,
      opaque: false,
      coverHidden: false,
      mainHidden: false,
    });
  });

  it('when the screen is a phone, then the phone transitions are left to themselves', async () => {
    await start(true);

    await router.navigateByUrl('/aktuality');

    expect(seenAtGuards.at(-1)).toEqual({
      covered: false,
      opaque: false,
      coverHidden: false,
      mainHidden: false,
    });
  });
});
