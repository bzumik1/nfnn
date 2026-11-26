import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  signal,
} from '@angular/core';

const HEIGHT = '--action-bar-height';
const SHARE_THAT_MOVES_INTO_THE_PAGE = 1 / 3;
const SHARE_THAT_FLOATS_AGAIN = 0.3;
const GAP_THAT_STARTS_RESTING_PX = 2;
const GAP_THAT_KEEPS_RESTING_PX = 0.5;

@Directive({
  selector: '[appActionBar]',
  host: {
    '[class.ui-action-bar--in-flow]': 'inFlow()',
    '[class.ui-action-bar--resting]': 'resting()',
    '(pointerdown)': 'used = true',
    '(focusin)': 'used = true',
  },
})
export class ActionBar {
  protected readonly inFlow = signal(false);
  protected readonly resting = signal(false);
  protected used = false;

  private tallestScreen = 0;
  private screenWidth = 0;
  private publishedHeight: string | null = null;

  constructor() {
    const bar = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const document = inject(DOCUMENT);
    const root = document.documentElement;
    const view = document.defaultView;
    const destroyRef = inject(DestroyRef);

    const place = () => {
      if (!view) {
        return;
      }
      const screen = this.stableScreenHeight(view, root);
      const height = bar.offsetHeight;
      const inFlow = this.inFlow()
        ? height > screen * SHARE_THAT_FLOATS_AGAIN
        : height > screen * SHARE_THAT_MOVES_INTO_THE_PAGE && !this.inUse(bar, document);
      this.inFlow.set(inFlow);
      this.resting.set(inFlow || this.standsAboveTheBottom(bar, view));
      this.publish(root, inFlow ? 0 : height);
    };

    afterNextRender(() => {
      place();
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(place);
        observer.observe(bar);
        if (bar.parentElement) {
          observer.observe(bar.parentElement);
        }
        destroyRef.onDestroy(() => observer.disconnect());
      }
      if (view) {
        view.addEventListener('scroll', place, { passive: true });
        view.addEventListener('resize', place, { passive: true });
        destroyRef.onDestroy(() => {
          view.removeEventListener('scroll', place);
          view.removeEventListener('resize', place);
        });
      }
    });
    destroyRef.onDestroy(() => root.style.removeProperty(HEIGHT));
  }

  private stableScreenHeight(view: Window, root: HTMLElement): number {
    if (view.innerWidth !== this.screenWidth) {
      this.screenWidth = view.innerWidth;
      this.tallestScreen = 0;
    }
    this.tallestScreen = Math.max(this.tallestScreen, view.innerHeight, root.clientHeight);
    return this.tallestScreen;
  }

  private inUse(bar: HTMLElement, document: Document): boolean {
    return this.used || bar.contains(document.activeElement);
  }

  private standsAboveTheBottom(bar: HTMLElement, view: Window): boolean {
    const offset = Number.parseFloat(view.getComputedStyle(bar).bottom);
    const stuckBottom = view.innerHeight - (Number.isFinite(offset) ? offset : 0);
    const gap = stuckBottom - bar.getBoundingClientRect().bottom;
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
