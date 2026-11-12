import { DOCUMENT, Location } from '@angular/common';
import { EnvironmentProviders, inject, Injectable, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { DirtyForms } from '../updates/dirty-forms';
import { BackSwipe, SwipePoint } from './back-swipe';
import { BackTarget } from './back-target';
import { PageTransitions, SwipePreview } from './page-transitions';
import { RouteChrome } from './route-chrome';

const FIELDS = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
const SCROLLS_SIDEWAYS = new Set(['auto', 'scroll']);

const PASSIVE: AddEventListenerOptions = { passive: true, capture: true };

type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

interface Swipe {
  readonly id: number;
  readonly pops: number;
  readonly motion: BackSwipe;
  preview: SwipePreview | null;
  previewAsked: boolean;
}

@Injectable({ providedIn: 'root' })
export class EdgeSwipeBack {
  private readonly document = inject(DOCUMENT);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly backTarget = inject(BackTarget);
  private readonly chrome = inject(RouteChrome).current;
  private readonly transitions = inject(PageTransitions);
  private readonly dirtyForms = inject(DirtyForms);
  private swipe: Swipe | null = null;
  private pops = 0;

  private readonly onStart = (event: TouchEvent): void => this.started(event);
  private readonly onMove = (event: TouchEvent): void => this.moved(event);
  private readonly onEnd = (event: TouchEvent): void => this.ended(event);
  private readonly onCancel = (): void => {
    void this.swipe?.preview?.slideBack();
    this.swipe = null;
  };
  private readonly onLeave = (): void => {
    this.pops++;
  };

  start(): void {
    const view = this.document.defaultView;
    if (view === null || !isHomeScreenApp(view.navigator as HomeScreenNavigator)) {
      return;
    }
    this.document.addEventListener('touchstart', this.onStart, PASSIVE);
    this.document.addEventListener('touchmove', this.onMove, PASSIVE);
    this.document.addEventListener('touchend', this.onEnd, PASSIVE);
    this.document.addEventListener('touchcancel', this.onCancel, PASSIVE);
    view.addEventListener('popstate', this.onLeave, PASSIVE);
    view.addEventListener('pagehide', this.onLeave, PASSIVE);
  }

  stop(): void {
    const view = this.document.defaultView;
    this.document.removeEventListener('touchstart', this.onStart, PASSIVE);
    this.document.removeEventListener('touchmove', this.onMove, PASSIVE);
    this.document.removeEventListener('touchend', this.onEnd, PASSIVE);
    this.document.removeEventListener('touchcancel', this.onCancel, PASSIVE);
    view?.removeEventListener('popstate', this.onLeave, PASSIVE);
    view?.removeEventListener('pagehide', this.onLeave, PASSIVE);
    this.swipe = null;
  }

  private started(event: TouchEvent): void {
    this.swipe = null;
    const touch = event.changedTouches[0];
    if (event.touches.length > 1 || touch === undefined || keepsItsOwnSwipe(event.target)) {
      return;
    }
    const width = this.document.defaultView?.innerWidth ?? 0;
    this.swipe = {
      id: touch.identifier,
      pops: this.pops,
      motion: new BackSwipe(pointOf(touch, event), width),
      preview: null,
      previewAsked: false,
    };
  }

  private moved(event: TouchEvent): void {
    const swipe = this.swipe;
    const touch = swipe === null ? undefined : touchOf(event, swipe.id);
    if (swipe === null || touch === undefined) {
      return;
    }
    swipe.motion.move(pointOf(touch, event));
    if (swipe.motion.abandoned) {
      this.swipe = null;
      return;
    }
    if (swipe.motion.dragging && !swipe.previewAsked) {
      swipe.previewAsked = true;
      swipe.preview = this.preview();
    }
    swipe.preview?.follow(swipe.motion.offset);
  }

  private ended(event: TouchEvent): void {
    const swipe = this.swipe;
    const touch = swipe === null ? undefined : touchOf(event, swipe.id);
    if (swipe === null || touch === undefined) {
      return;
    }
    this.swipe = null;
    const settle = swipe.motion.release(pointOf(touch, event));
    const goesBack = settle?.completes === true && swipe.pops === this.pops;
    const preview = swipe.preview;
    if (preview === null) {
      if (goesBack) {
        this.back();
      }
    } else if (goesBack && this.dirtyForms.any()) {
      void preview.slideBack().then(() => this.back());
    } else if (goesBack && settle !== null) {
      void preview.settle(settle).then(() => this.back());
    } else if (settle !== null && !settle.completes) {
      void preview.settle(settle);
    } else {
      void preview.slideBack();
    }
  }

  private preview(): SwipePreview | null {
    const parent = this.chrome().parent;
    if (parent === null || this.document.querySelector('dialog[open]') !== null) {
      return null;
    }
    return this.transitions.startSwipe(this.backTarget.destination(parent));
  }

  private back(): void {
    const dialogs = this.document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    const top = dialogs.item(dialogs.length - 1);
    if (top !== null && this.router.currentNavigation() !== null) {
      dismiss(top);
    } else if (top !== null) {
      this.location.back();
    } else {
      const parent = this.chrome().parent;
      if (parent !== null) {
        this.backTarget.back(parent);
      }
    }
  }
}

function isHomeScreenApp(navigator: HomeScreenNavigator): boolean {
  return navigator.standalone === true && navigator.maxTouchPoints > 0;
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

function dismiss(dialog: HTMLDialogElement): void {
  if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) {
    dialog.close();
  }
}

export const edgeSwipeBackAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(EdgeSwipeBack).start(),
);
