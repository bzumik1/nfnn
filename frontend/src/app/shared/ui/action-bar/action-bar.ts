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
const LARGEST_SHARE_OF_THE_SCREEN = 1 / 3;
const STUCK_TOLERANCE_PX = 1;

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
      const inFlow = bar.offsetHeight > view.innerHeight * LARGEST_SHARE_OF_THE_SCREEN;
      const offset = Number.parseFloat(view.getComputedStyle(bar).bottom);
      const stuckBottom = view.innerHeight - (Number.isFinite(offset) ? offset : 0);
      this.inFlow.set(inFlow);
      this.resting.set(
        inFlow || bar.getBoundingClientRect().bottom < stuckBottom - STUCK_TOLERANCE_PX,
      );
      root.style.setProperty(HEIGHT, `${inFlow ? 0 : bar.offsetHeight}px`);
    };

    afterNextRender(() => {
      place();
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(place);
        observer.observe(bar);
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
}
