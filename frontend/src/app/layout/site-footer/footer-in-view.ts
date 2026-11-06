import { afterNextRender, DestroyRef, DOCUMENT, ElementRef, inject } from '@angular/core';

export const FOOTER_IN_VIEW = 'footer-in-view';

export function markInView(className: string = FOOTER_IN_VIEW): void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const root = inject(DOCUMENT).documentElement;
  let observer: IntersectionObserver | null = null;
  afterNextRender(() => {
    if (typeof IntersectionObserver !== 'function') {
      return;
    }
    observer = new IntersectionObserver((entries) =>
      root.classList.toggle(className, entries[entries.length - 1].isIntersecting),
    );
    observer.observe(host);
  });
  inject(DestroyRef).onDestroy(() => {
    observer?.disconnect();
    root.classList.remove(className);
  });
}
