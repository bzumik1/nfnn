import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
} from '@angular/core';

const HEIGHT = '--action-bar-height';

@Directive({ selector: '[appActionBar]' })
export class ActionBar {
  constructor() {
    const bar = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const root = inject(DOCUMENT).documentElement;
    const destroyRef = inject(DestroyRef);
    const publish = () => root.style.setProperty(HEIGHT, `${bar.offsetHeight}px`);
    afterNextRender(() => {
      publish();
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(publish);
        observer.observe(bar);
        destroyRef.onDestroy(() => observer.disconnect());
      }
    });
    destroyRef.onDestroy(() => root.style.removeProperty(HEIGHT));
  }
}
