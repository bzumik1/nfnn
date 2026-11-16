import {
  afterNextRender,
  afterRenderEffect,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

const THUMB_RESTS = 'segmented--thumb';
const THUMB_GLIDES = 'segmented--thumb-glides';

export function restThumbOn(group: HTMLElement, thumb: HTMLElement, selected: number): boolean {
  const segments = [...group.querySelectorAll<HTMLElement>(':scope > button')];
  const first = segments[0];
  const segment = segments[selected];
  if (first === undefined || segment === undefined || segment.offsetWidth === 0) {
    return false;
  }
  if (segments.some((each) => each.offsetTop !== first.offsetTop)) {
    return false;
  }
  const shift = ((segment.offsetLeft - first.offsetLeft) / segment.offsetWidth) * 100;
  thumb.style.width = `${segment.offsetWidth}px`;
  thumb.style.translate = `${shift}% 0`;
  return true;
}

@Directive({
  selector: '[appSegmentThumb]',
})
export class SegmentThumb {
  readonly selected = input.required<number>({ alias: 'appSegmentThumb' });
  private readonly group = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterRenderEffect(() => this.place(this.selected(), true));
    afterNextRender(() => {
      const view = this.group.ownerDocument.defaultView;
      if (!view?.ResizeObserver) {
        return;
      }
      const observer = new view.ResizeObserver(() => this.place(this.selected(), false));
      observer.observe(this.group);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private place(selected: number, glides: boolean): void {
    const thumb = this.group.querySelector<HTMLElement>(':scope > .segment-thumb');
    if (thumb === null) {
      return;
    }
    const classes = this.group.classList;
    if (!glides) {
      classes.remove(THUMB_GLIDES);
    }
    const rests = restThumbOn(this.group, thumb, selected);
    classes.toggle(THUMB_RESTS, rests);
    if (!rests) {
      classes.remove(THUMB_GLIDES);
      return;
    }
    if (!classes.contains(THUMB_GLIDES)) {
      void this.group.ownerDocument.defaultView?.getComputedStyle(thumb).translate;
      classes.add(THUMB_GLIDES);
    }
  }
}
