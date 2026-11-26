import { Directive, ElementRef, inject } from '@angular/core';

import {
  focusWithoutScroll,
  liesWhollyInView,
  scrollerAround,
  viewBand,
} from '../../../core/layout/focus-in-view';
import { TrackedForm } from '../../../core/updates/tracked-form';

@Directive({
  selector: 'form[appFocusFirstInvalid]',
  hostDirectives: [TrackedForm],
  host: { '(submit)': 'focusFirstInvalid()' },
})
export class FocusFirstInvalid {
  private readonly form = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;

  focusFirstInvalid(): void {
    const control = this.form.querySelector<HTMLElement>('.form-control.ng-invalid');
    if (control === null || !focusWithoutScroll(control)) {
      return;
    }
    const field = control.closest('app-form-field') ?? control;
    if (liesWhollyInView(field)) {
      return;
    }
    const view = field.ownerDocument.defaultView;
    const scroller = view === null ? null : scrollerAround(view, field);
    if (scroller?.closest('dialog') != null && showsFromItsStart(scroller, field)) {
      scroller.scrollTo({ top: 0 });
    } else {
      field.scrollIntoView?.({ block: 'nearest' });
    }
  }
}

function showsFromItsStart(scroller: Element, field: Element): boolean {
  const visual = field.ownerDocument.defaultView?.visualViewport;
  const bottom = Math.min(
    viewBand(field).bottom,
    visual ? visual.offsetTop + visual.height : Number.POSITIVE_INFINITY,
  );
  return field.getBoundingClientRect().bottom + scroller.scrollTop <= bottom;
}
