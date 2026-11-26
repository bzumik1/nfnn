import {
  afterNextRender,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  untracked,
} from '@angular/core';

import {
  focusWithoutScroll,
  liesWhollyInView,
  scrollerAround,
  viewBand,
  ViewBand,
} from '../../../core/layout/focus-in-view';
import { SoftKeyboard, VisibleArea } from '../../../core/layout/soft-keyboard';
import { TrackedForm } from '../../../core/updates/tracked-form';

const STICKY_ACTIONS = '.ui-dialog__actions, .ui-action-bar';

interface PlacedField {
  readonly control: HTMLElement;
  keyboardSeen: boolean;
}

@Directive({
  selector: 'form[appFocusFirstInvalid]',
  hostDirectives: [TrackedForm],
  host: { '(submit)': 'focusFirstInvalid()' },
})
export class FocusFirstInvalid {
  private readonly form = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly keyboard = inject(SoftKeyboard);
  private placed: PlacedField | null = null;

  constructor() {
    effect(() => {
      const area = this.keyboard.visibleArea();
      untracked(() => this.keyboardMoved(area));
    });
  }

  focusFirstInvalid(): void {
    const control = this.form.querySelector<HTMLElement>('.form-control.ng-invalid');
    if (control === null || !focusWithoutScroll(control)) {
      this.placed = null;
      return;
    }
    this.placed = { control, keyboardSeen: this.keyboard.isOpen() };
    this.placeAfterRender(control);
  }

  private keyboardMoved(area: VisibleArea | null): void {
    const placed = this.placed;
    if (placed === null) {
      return;
    }
    if (!stillWaitsForInput(placed.control)) {
      this.placed = null;
      return;
    }
    if (area !== null) {
      placed.keyboardSeen = true;
    } else if (placed.keyboardSeen) {
      this.placed = null;
    }
    this.placeAfterRender(placed.control);
  }

  private placeAfterRender(control: HTMLElement): void {
    afterNextRender(() => bringFieldIntoView(control, this.keyboard.visibleArea()), {
      injector: this.injector,
    });
  }
}

function stillWaitsForInput(control: HTMLElement): boolean {
  const document = control.ownerDocument;
  const focused = document.activeElement;
  return (
    control.isConnected &&
    control.matches('.ng-invalid') &&
    (focused === control || focused === null || focused === document.body)
  );
}

function bringFieldIntoView(control: HTMLElement, keyboard: VisibleArea | null): void {
  const field = control.closest('app-form-field') ?? control;
  const view = field.ownerDocument.defaultView;
  const scroller = view === null ? null : scrollerAround(view, field);
  if (view === null || scroller === null) {
    if (!liesWhollyInView(field)) {
      const fits = field.getBoundingClientRect().height <= bandHeight(shownBand(field, keyboard));
      (fits ? field : control).scrollIntoView?.({ block: 'nearest' });
    }
    return;
  }
  const band = bandAboveStickyActions(view, scroller, shownBand(field, keyboard));
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

function shownBand(field: Element, keyboard: VisibleArea | null): ViewBand {
  const band = viewBand(field);
  return keyboard === null
    ? band
    : {
        top: Math.max(band.top, keyboard.top),
        bottom: Math.min(band.bottom, keyboard.top + keyboard.height),
      };
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
