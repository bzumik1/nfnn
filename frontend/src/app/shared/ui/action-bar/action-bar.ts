import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';

const HEIGHT = '--action-bar-height';
const SHARE_THAT_MOVES_INTO_THE_PAGE = 1 / 3;
const SHARE_THAT_FLOATS_AGAIN = 0.3;
const SHARE_OF_THE_TALLEST_SCREEN_THAT_RESETS_IT = 0.75;
const GAP_THAT_STARTS_RESTING_PX = 2;
const GAP_THAT_KEEPS_RESTING_PX = 0.5;

@Directive({
  selector: '[appActionBar]',
  host: {
    '[class.ui-action-bar--in-flow]': 'inFlow()',
    '[class.ui-action-bar--resting]': 'resting()',
  },
})
export class ActionBar {
  protected readonly inFlow = signal(false);
  protected readonly resting = signal(false);

  private held = false;
  private pressed = false;
  private tallestScreen = 0;
  private screenWidth = 0;
  private publishedHeight: string | null = null;
  private coarsePointer: MediaQueryList | null | undefined;

  constructor() {
    const bar = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const document = inject(DOCUMENT);
    const root = document.documentElement;
    const view = document.defaultView;
    const destroyRef = inject(DestroyRef);
    const injector = inject(Injector);

    const place = (releasedByUser = false) => {
      if (!view) {
        return;
      }
      const screen = this.stableScreenHeight(view, root);
      const height = bar.offsetHeight;
      const bottomOffset = this.bottomOffset(bar, view);
      if (height > view.innerHeight - bottomOffset) {
        this.held = false;
      }
      const inFlow = this.inFlow()
        ? this.pressed || height > screen * SHARE_THAT_FLOATS_AGAIN
        : height > screen * SHARE_THAT_MOVES_INTO_THE_PAGE && !this.held;
      if (inFlow && !this.inFlow() && !releasedByUser) {
        this.keepTheFocusInView(bar, document, injector);
      }
      this.inFlow.set(inFlow);
      this.resting.set(inFlow || this.standsAboveTheBottom(bar, view, bottomOffset));
      this.publish(root, inFlow ? 0 : height);
    };

    const placeAgain = () => place();
    const pressStarts = (event: Event) => {
      const inside = bar.contains(event.target as Node);
      this.pressed = inside;
      this.held = inside;
      place(!inside);
    };
    const pressEnds = () => {
      this.pressed = false;
      place();
    };
    const pressTurnsIntoScroll = () => {
      this.pressed = false;
      this.held = false;
      place(true);
    };
    const wheelScrolls = () => {
      this.held = false;
      place(true);
    };
    const focusArrives = (event: Event) => {
      const inside = bar.contains(event.target as Node);
      this.held = inside;
      place(!inside);
    };
    const focusLeaves = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next !== null && !bar.contains(next)) {
        this.held = false;
        place(true);
      }
    };

    afterNextRender(() => {
      place();
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(placeAgain);
        observer.observe(bar);
        if (bar.parentElement) {
          observer.observe(bar.parentElement);
        }
        destroyRef.onDestroy(() => observer.disconnect());
      }
      if (view) {
        const passive = { passive: true, capture: true };
        view.addEventListener('scroll', placeAgain, { passive: true });
        view.addEventListener('resize', placeAgain, { passive: true });
        view.addEventListener('wheel', wheelScrolls, passive);
        view.addEventListener('pointerdown', pressStarts, passive);
        view.addEventListener('pointerup', pressEnds, passive);
        view.addEventListener('pointercancel', pressTurnsIntoScroll, passive);
        view.addEventListener('focusin', focusArrives, true);
        bar.addEventListener('focusout', focusLeaves);
        destroyRef.onDestroy(() => {
          view.removeEventListener('scroll', placeAgain);
          view.removeEventListener('resize', placeAgain);
          view.removeEventListener('wheel', wheelScrolls, true);
          view.removeEventListener('pointerdown', pressStarts, true);
          view.removeEventListener('pointerup', pressEnds, true);
          view.removeEventListener('pointercancel', pressTurnsIntoScroll, true);
          view.removeEventListener('focusin', focusArrives, true);
          bar.removeEventListener('focusout', focusLeaves);
        });
      }
    });
    destroyRef.onDestroy(() => root.style.removeProperty(HEIGHT));
  }

  private stableScreenHeight(view: Window, root: HTMLElement): number {
    const current = Math.max(view.innerHeight, root.clientHeight);
    if (view.innerWidth !== this.screenWidth) {
      this.screenWidth = view.innerWidth;
      this.tallestScreen = 0;
      this.held = false;
    }
    if (this.coarsePointer === undefined) {
      this.coarsePointer = view.matchMedia?.('(pointer: coarse)') ?? null;
    }
    const toolbarsComeAndGo = this.coarsePointer?.matches ?? false;
    if (
      !toolbarsComeAndGo ||
      current < this.tallestScreen * SHARE_OF_THE_TALLEST_SCREEN_THAT_RESETS_IT
    ) {
      this.tallestScreen = 0;
    }
    this.tallestScreen = Math.max(this.tallestScreen, current);
    return this.tallestScreen;
  }

  private keepTheFocusInView(bar: HTMLElement, document: Document, injector: Injector): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && bar.contains(focused)) {
      afterNextRender(
        () => {
          if (document.activeElement === focused && bar.contains(focused)) {
            focused.scrollIntoView?.({ block: 'nearest' });
          }
        },
        { injector },
      );
    }
  }

  private bottomOffset(bar: HTMLElement, view: Window): number {
    const offset = Number.parseFloat(view.getComputedStyle(bar).bottom);
    return Number.isFinite(offset) ? offset : 0;
  }

  private standsAboveTheBottom(bar: HTMLElement, view: Window, bottomOffset: number): boolean {
    const gap = view.innerHeight - bottomOffset - bar.getBoundingClientRect().bottom;
    return this.resting() ? gap > GAP_THAT_KEEPS_RESTING_PX : gap > GAP_THAT_STARTS_RESTING_PX;
  }

  private publish(root: HTMLElement, height: number): void {
    const value = `${height}px`;
    if (value !== this.publishedHeight) {
      this.publishedHeight = value;
      root.style.setProperty(HEIGHT, value);
    }
  }
}
