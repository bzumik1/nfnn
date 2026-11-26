import { afterNextRender, Directive, ElementRef, inject, Injector } from '@angular/core';

import {
  focusWithoutScroll,
  liesWhollyInView,
  scrollerAround,
  viewBand,
  ViewBand,
} from '../../../core/layout/focus-in-view';
import { TrackedForm } from '../../../core/updates/tracked-form';

@Directive({
  selector: 'form[appFocusFirstInvalid]',
  hostDirectives: [TrackedForm],
  host: { '(submit)': 'focusFirstInvalid()' },
})
export class FocusFirstInvalid {
  private readonly form = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  focusFirstInvalid(): void {
    const control = this.form.querySelector<HTMLElement>('.form-control.ng-invalid');
    if (control === null || !focusWithoutScroll(control)) {
      return;
    }
    afterNextRender(() => bringFieldIntoView(control), { injector: this.injector });
  }
}

function bringFieldIntoView(control: HTMLElement): void {
  const field = control.closest('app-form-field') ?? control;
  if (liesWhollyInView(field)) {
    return;
  }
  const band = shownBand(field);
  const box = field.getBoundingClientRect();
  const view = field.ownerDocument.defaultView;
  const scroller = view === null ? null : scrollerAround(view, field);
  if (scroller?.closest('dialog') != null && box.bottom + scroller.scrollTop <= band.bottom) {
    scroller.scrollTo({ top: 0 });
  } else if (box.height <= band.bottom - band.top) {
    field.scrollIntoView?.({ block: 'nearest' });
  } else {
    control.scrollIntoView?.({ block: 'nearest' });
  }
}

function shownBand(field: Element): ViewBand {
  const band = viewBand(field);
  const visual = field.ownerDocument.defaultView?.visualViewport;
  return visual
    ? { top: band.top, bottom: Math.min(band.bottom, visual.offsetTop + visual.height) }
    : band;
}
