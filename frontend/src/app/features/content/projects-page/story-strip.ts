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
    if (next) {
      this.bring(next, direction === 1 ? 'start' : 'end', this.motion());
    }
  }

  protected measure(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.strip;
    this.overflows.set(scrollWidth > clientWidth + EDGE_TOLERANCE_PX);
    this.canStepBack.set(scrollLeft > EDGE_TOLERANCE_PX);
    this.canStepOn.set(scrollLeft + clientWidth < scrollWidth - EDGE_TOLERANCE_PX);
  }

  protected reveal(event: FocusEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.matches(':focus-visible')) {
      return;
    }
    const item = target.closest('li');
    if (item?.parentElement !== this.strip) {
      return;
    }
    const frame = this.strip.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.left < frame.left || box.right > frame.right) {
      this.bring(item, 'start', 'instant');
    }
  }

  private bring(item: Element, edge: 'start' | 'end', behavior: ScrollBehavior): void {
    const frame = this.strip.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    const style = this.view?.getComputedStyle(this.strip);
    const padding =
      parseFloat(
        edge === 'start'
          ? (style?.scrollPaddingInlineStart ?? '')
          : (style?.scrollPaddingInlineEnd ?? ''),
      ) || 0;
    const left =
      edge === 'start'
        ? this.strip.scrollLeft + box.left - frame.left - padding
        : this.strip.scrollLeft + box.right - frame.right + padding;
    this.strip.scrollTo({ left, behavior });
  }

  private motion(): ScrollBehavior {
    return this.view?.matchMedia(LESS_MOTION).matches ? 'instant' : 'smooth';
  }
}
