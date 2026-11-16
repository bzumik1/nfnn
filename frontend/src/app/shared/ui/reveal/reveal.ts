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
const WATCHED_FROM = { rootMargin: '0px 0px -10% 0px', threshold: 0 };
const SCROLLED_IN_BELOW = 0.5;

type Showing = 'still' | 'waiting' | 'moving';
type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

@Directive({
  selector: '[appReveal]',
  host: {
    '[class.motion-reveal]': "showing() !== 'still'",
    '[class.motion-reveal--shown]': "showing() === 'moving'",
    '[style.--reveal-order]': 'order()',
    '(focusin)': 'showAtOnce()',
  },
})
export class Reveal {
  readonly order = input(0, {
    alias: 'appReveal',
    transform: (value: unknown) => Math.min(numberAttribute(value, 0), LONGEST_ROW),
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly view = inject(DOCUMENT).defaultView;
  protected readonly showing = signal<Showing>('still');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const view = this.view;
      if (view === null || !mayMove(view) || this.startsInSight(view)) {
        return;
      }
      this.showing.set('waiting');
      const observer = new IntersectionObserver((entries) => {
        const sighted = entries.find((entry) => entry.isIntersecting);
        if (sighted === undefined) {
          return;
        }
        observer.disconnect();
        this.showing.update((showing) =>
          showing === 'waiting' && scrolledIn(sighted, view) ? 'moving' : 'still',
        );
      }, WATCHED_FROM);
      observer.observe(this.host.nativeElement);
      const showForPrint = () => this.showAtOnce();
      view.addEventListener('beforeprint', showForPrint);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        view.removeEventListener('beforeprint', showForPrint);
      });
    });
  }

  protected showAtOnce(): void {
    if (this.showing() === 'waiting') {
      this.showing.set('still');
    }
  }

  private startsInSight(view: Window): boolean {
    return this.host.nativeElement.getBoundingClientRect().top < view.innerHeight;
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
