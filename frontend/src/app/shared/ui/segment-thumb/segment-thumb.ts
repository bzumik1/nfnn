import {
  afterNextRender,
  afterRenderEffect,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

const THUMB_RESTS = 'ui-segmented--thumb';
const THUMB_GLIDES = 'ui-segmented--thumb-glides';

export function restThumbOn(group: HTMLElement, thumb: HTMLElement, selected: number): boolean {
  const boxes = [...group.querySelectorAll<HTMLElement>(':scope > button')].map((each) =>
    each.getBoundingClientRect(),
  );
  const first = boxes[0];
  const segment = boxes[selected];
  const choice = group.getBoundingClientRect();
  if (first === undefined || segment === undefined || segment.width === 0 || choice.width === 0) {
    return false;
  }
  if (boxes.some((each) => Math.abs(each.top - first.top) >= 1)) {
    return false;
  }
  const shift = ((segment.left - first.left) / segment.width) * 100;
  thumb.style.width = `${(segment.width / choice.width) * 100}%`;
  thumb.style.translate = `${shift}% 0`;
  return true;
}

interface ThumbBox {
  left: number;
  width: number;
}

function thumbBox(group: HTMLElement, thumb: HTMLElement): ThumbBox | null {
  const first = group.querySelector<HTMLElement>(':scope > button')?.getBoundingClientRect();
  const box = thumb.getBoundingClientRect();
  if (first === undefined || box.width === 0) {
    return null;
  }
  return { left: box.left - first.left, width: box.width };
}

function settle(thumb: HTMLElement): void {
  void thumb.ownerDocument.defaultView?.getComputedStyle(thumb).translate;
}

export function placeThumb(group: HTMLElement, selected: number, glides: boolean): void {
  const thumb = group.querySelector<HTMLElement>(':scope > .ui-segmented__thumb');
  if (thumb === null) {
    return;
  }
  const classes = group.classList;
  const restedAt = thumb.style.translate;
  const from = glides && classes.contains(THUMB_RESTS) ? thumbBox(group, thumb) : null;
  const rests = restThumbOn(group, thumb, selected);
  classes.toggle(THUMB_RESTS, rests);
  const moves = thumb.style.translate !== restedAt;
  if (!rests || (!glides && moves)) {
    classes.remove(THUMB_GLIDES);
    thumb.style.scale = '';
  }
  if (!rests) {
    return;
  }
  const to = glides && moves && from !== null ? thumbBox(group, thumb) : null;
  if (from !== null && to !== null) {
    const restsAt = thumb.style.translate;
    classes.remove(THUMB_GLIDES);
    thumb.style.translate = `${(from.left / to.width) * 100}% 0`;
    thumb.style.scale = `${from.width / to.width} 1`;
    settle(thumb);
    classes.add(THUMB_GLIDES);
    thumb.style.translate = restsAt;
    thumb.style.scale = '';
    return;
  }
  if (!classes.contains(THUMB_GLIDES)) {
    settle(thumb);
    classes.add(THUMB_GLIDES);
  }
}

export function labelSegments(group: HTMLElement): void {
  for (const segment of group.querySelectorAll<HTMLElement>(':scope > button')) {
    const label = (segment.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (segment.dataset['label'] !== label) {
      segment.dataset['label'] = label;
    }
  }
}

@Directive({
  selector: '[appSegmentThumb]',
})
export class SegmentThumb {
  readonly selected = input.required<number>({ alias: 'appSegmentThumb' });
  private readonly group = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterRenderEffect(() => placeThumb(this.group, this.selected(), true));
    afterNextRender(() => {
      const view = this.group.ownerDocument.defaultView;
      labelSegments(this.group);
      if (view?.MutationObserver) {
        const labels = new view.MutationObserver(() => labelSegments(this.group));
        labels.observe(this.group, { subtree: true, childList: true, characterData: true });
        this.destroyRef.onDestroy(() => labels.disconnect());
      }
      if (!view?.ResizeObserver) {
        return;
      }
      const observer = new view.ResizeObserver(() =>
        placeThumb(this.group, this.selected(), false),
      );
      observer.observe(this.group);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
