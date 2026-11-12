import {
  DestroyRef,
  Directive,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  untracked,
} from '@angular/core';

import { isTextEntry, SoftKeyboard } from '../../../core/layout/soft-keyboard';

const ROOM_ABOVE_KEYBOARD_PX = 16;
const PASSIVE_CAPTURE: AddEventListenerOptions = { passive: true, capture: true };

interface Region {
  readonly top: number;
  readonly bottom: number;
}

@Directive({
  selector: 'dialog[appKeyboardAvoidance]',
  host: { '(focusin)': 'revealFocused()' },
})
export class KeyboardAvoidance {
  private readonly dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly keyboard = inject(SoftKeyboard);
  private draggedByOneFinger = false;

  constructor() {
    effect(() => {
      if (this.keyboard.visibleArea() !== null) {
        untracked(() => this.revealFocused());
      }
    });
    const touchStarted = (event: TouchEvent) => {
      this.draggedByOneFinger = event.touches.length === 1 && !isTextEntry(event.target as Element);
    };
    const touchEnded = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        this.draggedByOneFinger = false;
      }
    };
    const scrolled = (event: Event) => this.scrolled(event);
    this.dialog.addEventListener('touchstart', touchStarted, PASSIVE_CAPTURE);
    this.dialog.addEventListener('touchend', touchEnded, PASSIVE_CAPTURE);
    this.dialog.addEventListener('touchcancel', touchEnded, PASSIVE_CAPTURE);
    this.dialog.addEventListener('scroll', scrolled, PASSIVE_CAPTURE);
    inject(DestroyRef).onDestroy(() => {
      this.dialog.removeEventListener('touchstart', touchStarted, PASSIVE_CAPTURE);
      this.dialog.removeEventListener('touchend', touchEnded, PASSIVE_CAPTURE);
      this.dialog.removeEventListener('touchcancel', touchEnded, PASSIVE_CAPTURE);
      this.dialog.removeEventListener('scroll', scrolled, PASSIVE_CAPTURE);
    });
  }

  revealFocused(): void {
    const focused = this.document.activeElement;
    const panel = this.panel();
    if (!this.keyboard.isOpen() || !(focused instanceof HTMLElement) || !panel?.contains(focused)) {
      return;
    }
    const scroller = getComputedStyle(panel).overflowY === 'auto' ? panel : this.dialog;
    const visible = this.visibleRegionOf(scroller);
    const field = focused.getBoundingClientRect();
    const action = focused
      .closest('form')
      ?.querySelector('[type="submit"]')
      ?.getBoundingClientRect();
    const room = visible.bottom - visible.top - 2 * ROOM_ABOVE_KEYBOARD_PX;
    const bottom =
      action !== undefined && action.bottom - field.top <= room
        ? Math.max(field.bottom, action.bottom)
        : field.bottom;
    const hiddenBelow = bottom - (visible.bottom - ROOM_ABOVE_KEYBOARD_PX);
    const hiddenAbove = visible.top + ROOM_ABOVE_KEYBOARD_PX - field.top;
    if (hiddenBelow > 0) {
      scroller.scrollBy({ top: hiddenBelow });
    } else if (hiddenAbove > 0) {
      scroller.scrollBy({ top: -hiddenAbove });
    }
  }

  private scrolled(event: Event): void {
    const scroller = event.target;
    const panel = this.panel();
    if (scroller !== this.dialog && scroller !== panel) {
      return;
    }
    if (this.draggedByOneFinger && this.keyboard.isOpen() && panel !== null) {
      this.draggedByOneFinger = false;
      this.putKeyboardAway(panel);
    }
  }

  private putKeyboardAway(panel: HTMLElement): void {
    panel.setAttribute('tabindex', '-1');
    panel.addEventListener('blur', () => panel.removeAttribute('tabindex'), { once: true });
    panel.focus({ preventScroll: true });
  }

  private panel(): HTMLElement | null {
    return this.dialog.querySelector<HTMLElement>('.dialog-panel');
  }

  private visibleRegionOf(scroller: HTMLElement): Region {
    const box = scroller.getBoundingClientRect();
    const area = this.keyboard.visibleArea();
    return area === null
      ? box
      : {
          top: Math.max(box.top, area.top),
          bottom: Math.min(box.bottom, area.top + area.height),
        };
  }
}
