import { afterNextRender, Directive, ElementRef, inject, Injector } from '@angular/core';

import {
  focusWithoutScroll,
  liesWhollyInView,
  scrollerAround,
  viewBand,
  ViewBand,
} from '../../../core/layout/focus-in-view';
import { TrackedForm } from '../../../core/updates/tracked-form';

const STICKY_ACTIONS = '.ui-dialog__actions, .ui-action-bar';

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
  const view = field.ownerDocument.defaultView;
  const scroller = view === null ? null : scrollerAround(view, field);
  if (view === null || scroller === null) {
    if (!liesWhollyInView(field)) {
      const fits = field.getBoundingClientRect().height <= bandHeight(shownBand(field));
      (fits ? field : control).scrollIntoView?.({ block: 'nearest' });
    }
    return;
  }
  const band = bandAboveStickyActions(view, scroller, shownBand(field));
  const box = field.getBoundingClientRect();
  if (scroller.closest('dialog') !== null && box.bottom + scroller.scrollTop <= band.bottom) {
    scroller.scrollTo({ top: 0 });
    return;
  }
  const shown = (box.height <= bandHeight(band) ? field : control).getBoundingClientRect();
  const hiddenAbove = band.top - shown.top;
  const hiddenBelow = shown.bottom - band.bottom;
  if (hiddenAbove > 0) {
    scroller.scrollBy({ top: -hiddenAbove });
  } else if (hiddenBelow > 0) {
    scroller.scrollBy({ top: hiddenBelow });
  }
}

function shownBand(field: Element): ViewBand {
  const band = viewBand(field);
  const visual = field.ownerDocument.defaultView?.visualViewport;
  return visual
    ? {
        top: Math.max(band.top, visual.offsetTop),
        bottom: Math.min(band.bottom, visual.offsetTop + visual.height),
      }
    : band;
}

function bandAboveStickyActions(view: Window, scroller: Element, band: ViewBand): ViewBand {
  const dialog = scroller.closest('dialog');
  const port =
    scroller.getBoundingClientRect().top +
    scroller.clientTop +
    scroller.clientHeight -
    (parseFloat(view.getComputedStyle(scroller).paddingBottom) || 0);
  const tops = Array.from(scroller.querySelectorAll(STICKY_ACTIONS))
    .filter((actions) => actions.closest('dialog') === dialog)
    .map((actions) => ({ actions, style: view.getComputedStyle(actions) }))
    .filter(({ style }) => style.position === 'sticky')
    .map(
      ({ actions, style }) =>
        port - (parseFloat(style.bottom) || 0) - actions.getBoundingClientRect().height,
    );
  return { top: band.top, bottom: Math.min(band.bottom, ...tops) };
}

function bandHeight(band: ViewBand): number {
  return band.bottom - band.top;
}
