import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';

const LONGEST_ROW = 6;
const LINE = '0px 0px -10% 0px';
const SCREEN = '0px';
const SCROLLED_IN_BELOW = 0.7;
const LAST_MOVING_PROPERTY = 'translate';

type Showing = 'still' | 'waiting' | 'moving';
type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

@Directive({
  selector: '[appReveal]',
  host: {
    '[class.motion-reveal]': "showing() !== 'still'",
    '[class.motion-reveal--shown]': "showing() === 'moving'",
    '[style.--reveal-order]': 'order()',
    '(focusin)': 'showAtOnce()',
    '(transitionend)': 'settle($event)',
    '(transitioncancel)': 'settle($event)',
  },
})
export class Reveal {
  readonly order = input(0, {
    alias: 'appReveal',
    transform: (value: unknown) => Math.min(numberAttribute(value, 0), LONGEST_ROW),
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  protected readonly showing = signal<Showing>('still');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const view = this.document.defaultView;
      if (view === null || !mayMove(view) || this.startsInSight(view)) {
        return;
      }
      this.showing.set('waiting');
      let lateReveal: ReturnType<typeof setTimeout> | undefined;
      const stopWatching = () => {
        clearTimeout(lateReveal);
        line.disconnect();
        screen.disconnect();
        view.removeEventListener('beforeprint', showForPrint);
      };
      const line = new IntersectionObserver(
        (entries) => {
          const sighted = entries.find((entry) => entry.isIntersecting);
          if (sighted !== undefined) {
            stopWatching();
            this.reveal(scrolledIn(sighted, view) ? 'moving' : 'still');
          }
        },
        { rootMargin: LINE, threshold: 0 },
      );
      const screen = new IntersectionObserver(
        (entries) => {
          clearTimeout(lateReveal);
          if (entries.some((entry) => entry.isIntersecting)) {
            lateReveal = setTimeout(() => {
              stopWatching();
              this.reveal('moving');
            }, this.revealMs(view));
          }
        },
        { rootMargin: SCREEN, threshold: 0 },
      );
      const showForPrint = () => this.showAtOnce();
      line.observe(this.host.nativeElement);
      screen.observe(this.host.nativeElement);
      view.addEventListener('beforeprint', showForPrint);
      destroyRef.onDestroy(stopWatching);
    });
  }

  protected showAtOnce(): void {
    this.reveal('still');
  }

  protected settle(event: TransitionEvent): void {
    if (event.target === this.host.nativeElement && event.propertyName === LAST_MOVING_PROPERTY) {
      this.showing.set('still');
    }
  }

  private reveal(showing: Exclude<Showing, 'waiting'>): void {
    if (this.showing() === 'waiting') {
      this.showing.set(showing);
    }
  }

  private startsInSight(view: Window): boolean {
    return this.host.nativeElement.getBoundingClientRect().top < view.innerHeight;
  }

  private revealMs(view: Window): number {
    const token = view
      .getComputedStyle(this.document.documentElement)
      .getPropertyValue('--duration-reveal')
      .trim();
    const value = Number.parseFloat(token);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return token.endsWith('ms') ? value : value * 1000;
  }
}

function mayMove(view: Window): boolean {
  const navigator = view.navigator as HomeScreenNavigator;
  const homeScreenApp = navigator.standalone === true && navigator.maxTouchPoints > 0;
  const lessMotion =
    typeof view.matchMedia === 'function' &&
    view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !homeScreenApp && !lessMotion && typeof IntersectionObserver === 'function';
}

function scrolledIn(entry: IntersectionObserverEntry, view: Window): boolean {
  return entry.boundingClientRect.top >= view.innerHeight * SCROLLED_IN_BELOW;
}
