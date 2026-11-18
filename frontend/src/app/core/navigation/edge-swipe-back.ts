import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { DirtyForms } from '../updates/dirty-forms';
import { BackSwipe, SwipePoint } from './back-swipe';
import { BackTarget } from './back-target';
import { isHomeScreenApp } from './edge-swipe-back-start';
import { PageTransitions, SwipePreview } from './page-transitions';
import { RouteChrome } from './route-chrome';
import { SheetSteps, StepsInside } from './sheet-steps';

const FIELDS = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
const SCROLLS_SIDEWAYS = new Set(['auto', 'scroll']);
const OPEN_DIALOG = 'dialog[open]';
const LEAVING_DIALOG = 'dialog.dialog--leaving';
const SHEET_SECTION_BACK = 'app-sheet-head .sheet-head-back';
export const TOUCH_LOST_MS = 1000;
const DRAGGING_CLASS = 'edge-swipe-dragging';
const PRESS_TAKEN_OVER = `.${DRAGGING_CLASS} :active {
  --pressed-tint: 0% !important;
  --pressed-tint-amount: 0% !important;
  filter: none !important;
  opacity: 1 !important;
  transform: none !important;
}`;

const PASSIVE: AddEventListenerOptions = { passive: true, capture: true };

interface Swipe {
  readonly id: number;
  readonly pops: number;
  readonly motion: BackSwipe;
  readonly steps: StepsInside;
  readonly ofPage: boolean;
  preview: SwipePreview | null;
  previewAsked: boolean;
}

@Injectable({ providedIn: 'root' })
export class EdgeSwipeBack {
  private readonly document = inject(DOCUMENT);
  private readonly backTarget = inject(BackTarget);
  private readonly chrome = inject(RouteChrome).current;
  private readonly transitions = inject(PageTransitions);
  private readonly dirtyForms = inject(DirtyForms);
  private readonly sheetSteps = inject(SheetSteps);
  private swipe: Swipe | null = null;
  private pressCancel: CSSStyleSheet | null = null;
  private pops = 0;
  private touchLost: ReturnType<typeof setTimeout> | undefined;

  private readonly onStart = (event: TouchEvent): void => this.started(event);
  private readonly onMove = (event: TouchEvent): void => this.moved(event);
  private readonly onEnd = (event: TouchEvent): void => this.ended(event);
  private readonly onCancel = (): void => this.callOff();
  private readonly onHidden = (): void => {
    if (this.document.visibilityState === 'hidden') {
      this.callOff();
    }
  };
  private readonly onLeave = (): void => {
    this.pops++;
  };

  start(): void {
    const view = this.document.defaultView;
    if (view === null || !isHomeScreenApp(view.navigator)) {
      return;
    }
    void this.transitions.loadDrawing();
    this.document.addEventListener('touchstart', this.onStart, PASSIVE);
    this.document.addEventListener('touchmove', this.onMove, PASSIVE);
    this.document.addEventListener('touchend', this.onEnd, PASSIVE);
    this.document.addEventListener('touchcancel', this.onCancel, PASSIVE);
    this.document.addEventListener('pointercancel', this.onCancel, PASSIVE);
    this.document.addEventListener('visibilitychange', this.onHidden, PASSIVE);
    view.addEventListener('popstate', this.onLeave, PASSIVE);
    view.addEventListener('pagehide', this.onLeave, PASSIVE);
  }

  stop(): void {
    const view = this.document.defaultView;
    this.document.removeEventListener('touchstart', this.onStart, PASSIVE);
    this.document.removeEventListener('touchmove', this.onMove, PASSIVE);
    this.document.removeEventListener('touchend', this.onEnd, PASSIVE);
    this.document.removeEventListener('touchcancel', this.onCancel, PASSIVE);
    this.document.removeEventListener('pointercancel', this.onCancel, PASSIVE);
    this.document.removeEventListener('visibilitychange', this.onHidden, PASSIVE);
    view?.removeEventListener('popstate', this.onLeave, PASSIVE);
    view?.removeEventListener('pagehide', this.onLeave, PASSIVE);
    this.letGo();
  }

  private started(event: TouchEvent): void {
    this.callOff();
    const touch = event.changedTouches[0];
    if (event.touches.length > 1 || touch === undefined || keepsItsOwnSwipe(event.target)) {
      return;
    }
    const target = this.stepsHere();
    if (target === null) {
      return;
    }
    const width = this.document.defaultView?.innerWidth ?? 0;
    this.swipe = {
      id: touch.identifier,
      pops: this.pops,
      motion: new BackSwipe(pointOf(touch, event), width),
      steps: target.steps,
      ofPage: target.ofPage,
      preview: null,
      previewAsked: false,
    };
  }

  private stepsHere(): { steps: StepsInside; ofPage: boolean } | null {
    if (this.document.querySelector(LEAVING_DIALOG) !== null) {
      return null;
    }
    const dialogs = this.document.querySelectorAll<HTMLDialogElement>(OPEN_DIALOG);
    if (dialogs.length > 0) {
      const top = dialogs.item(dialogs.length - 1);
      const steps = this.sheetSteps.of(top) ?? sectionBackOf(top);
      return steps === null ? null : { steps, ofPage: false };
    }
    const parent = this.chrome().parent;
    if (parent === null || !this.transitions.stepsBySwipe()) {
      return null;
    }
    return {
      ofPage: true,
      steps: {
        startSwipe: () => this.transitions.startSwipe(this.backTarget.destination(parent)),
        back: () => this.backTarget.back(parent),
      },
    };
  }

  private takeOverPress(): void {
    this.document.documentElement.classList.add(DRAGGING_CLASS);
    const adopted = this.document.adoptedStyleSheets;
    if (this.pressCancel === null && Array.isArray(adopted)) {
      this.pressCancel = new CSSStyleSheet();
      this.pressCancel.replaceSync(PRESS_TAKEN_OVER);
      this.document.adoptedStyleSheets = [...adopted, this.pressCancel];
    }
  }

  private callOff(): void {
    void this.swipe?.preview?.slideBack();
    this.letGo();
  }

  private letGo(): void {
    clearTimeout(this.touchLost);
    this.swipe = null;
    this.document.documentElement.classList.remove(DRAGGING_CLASS);
  }

  private moved(event: TouchEvent): void {
    const swipe = this.swipe;
    const touch = swipe === null ? undefined : touchOf(event, swipe.id);
    if (swipe === null || touch === undefined) {
      return;
    }
    swipe.motion.move(pointOf(touch, event));
    if (swipe.motion.abandoned) {
      this.letGo();
      return;
    }
    if (swipe.motion.dragging && !swipe.previewAsked) {
      swipe.previewAsked = true;
      if (this.transitions.followsFinger()) {
        swipe.preview = swipe.steps.startSwipe();
        if (swipe.preview === null && swipe.ofPage) {
          this.letGo();
          return;
        }
      }
      this.takeOverPress();
    }
    swipe.preview?.follow(swipe.motion.offset);
    if (swipe.motion.dragging) {
      clearTimeout(this.touchLost);
      this.touchLost = setTimeout(() => this.callOff(), TOUCH_LOST_MS);
    }
  }

  private ended(event: TouchEvent): void {
    const swipe = this.swipe;
    const touch = swipe === null ? undefined : touchOf(event, swipe.id);
    if (swipe === null || touch === undefined) {
      return;
    }
    this.letGo();
    const settle = swipe.motion.release(pointOf(touch, event));
    const goesBack = settle?.completes === true && swipe.pops === this.pops;
    const back = (): void => swipe.steps.back();
    const preview = swipe.preview;
    if (preview === null) {
      if (goesBack) {
        back();
      }
    } else if (goesBack && swipe.ofPage && this.dirtyForms.any()) {
      void preview.slideBack().then(back);
    } else if (goesBack && settle !== null) {
      void preview.settle(settle).then((left) => {
        if (left) {
          back();
        }
      });
    } else if (settle !== null && !settle.completes) {
      void preview.settle(settle);
    } else {
      void preview.slideBack();
    }
  }
}

function sectionBackOf(dialog: HTMLDialogElement): StepsInside | null {
  const back = dialog.querySelector<HTMLElement>(SHEET_SECTION_BACK);
  return back === null ? null : { startSwipe: () => null, back: () => back.click() };
}

function pointOf(touch: Touch, event: TouchEvent): SwipePoint {
  return { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
}

function touchOf(event: TouchEvent, id: number): Touch | undefined {
  return Array.from(event.changedTouches).find((touch) => touch.identifier === id);
}

function keepsItsOwnSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(FIELDS) !== null) {
    return true;
  }
  const view = target.ownerDocument.defaultView;
  for (let node: Element | null = target; node !== null; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    if (style?.touchAction === 'none') {
      return true;
    }
    if (SCROLLS_SIDEWAYS.has(style?.overflowX ?? '') && node.scrollWidth > node.clientWidth) {
      return true;
    }
  }
  return false;
}
