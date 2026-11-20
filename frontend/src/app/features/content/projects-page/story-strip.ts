import { DOCUMENT } from '@angular/common';
import { afterNextRender, DestroyRef, Directive, ElementRef, inject, signal } from '@angular/core';

const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const EDGE_TOLERANCE_PX = 1;

@Directive({
  selector: '[appStoryStrip]',
  exportAs: 'appStoryStrip',
  host: {
    '(scroll)': 'measure()',
    '(focusin)': 'reveal($event)',
  },
})
export class StoryStrip {
  private readonly strip: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly view = inject(DOCUMENT).defaultView;

  readonly overflows = signal(false);
  readonly canStepBack = signal(false);
  readonly canStepOn = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.measure();
      if (!this.view) {
        return;
      }
      const resizes = new this.view.ResizeObserver(() => this.measure());
      const changes = new this.view.MutationObserver(() => this.measure());
      resizes.observe(this.strip);
      changes.observe(this.strip, { childList: true });
      destroyRef.onDestroy(() => {
        resizes.disconnect();
        changes.disconnect();
      });
    });
  }

  step(direction: -1 | 1): void {
    const frame = this.strip.getBoundingClientRect();
    const items = Array.from(this.strip.children);
    const next =
      direction === 1
        ? items.find((item) => item.getBoundingClientRect().right > frame.right + EDGE_TOLERANCE_PX)
        : items
            .reverse()
            .find((item) => item.getBoundingClientRect().left < frame.left - EDGE_TOLERANCE_PX);
    next?.scrollIntoView({
      behavior: this.view?.matchMedia(LESS_MOTION).matches ? 'instant' : 'smooth',
      block: 'nearest',
      inline: direction === 1 ? 'start' : 'end',
    });
  }

  protected measure(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.strip;
    this.overflows.set(scrollWidth > clientWidth + EDGE_TOLERANCE_PX);
    this.canStepBack.set(scrollLeft > EDGE_TOLERANCE_PX);
    this.canStepOn.set(scrollLeft + clientWidth < scrollWidth - EDGE_TOLERANCE_PX);
  }

  protected reveal(event: FocusEvent): void {
    const item = event.target instanceof Element ? event.target.closest('li') : null;
    if (item?.parentElement !== this.strip) {
      return;
    }
    const frame = this.strip.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.left < frame.left || box.right > frame.right) {
      item.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'start' });
    }
  }
}
