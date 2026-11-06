import { DOCUMENT, Location } from '@angular/common';
import { EnvironmentProviders, inject, Injectable, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { BackTarget } from './back-target';
import { RouteChrome } from './route-chrome';

const TAP_SLOP_PX = 10;
const HOLD_BEFORE_MOVE_MS = 500;
const COMMIT_SHARE_OF_WIDTH = 0.3;
const FLICK_MIN_PX = 40;
const FLICK_MIN_SPEED_PX_PER_MS = 0.3;
const FLICK_REST_MS = 100;
const FIELDS = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
const SCROLLS_SIDEWAYS = new Set(['auto', 'scroll']);

const PASSIVE: AddEventListenerOptions = { passive: true, capture: true };

type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

interface Swipe {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly at: number;
  readonly pops: number;
  moved: boolean;
  furthestX: number;
  lastX: number;
  lastAt: number;
  speed: number;
}

@Injectable({ providedIn: 'root' })
export class EdgeSwipeBack {
  private readonly document = inject(DOCUMENT);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly backTarget = inject(BackTarget);
  private readonly chrome = inject(RouteChrome).current;
  private swipe: Swipe | null = null;
  private pops = 0;

  private readonly onStart = (event: TouchEvent): void => this.started(event);
  private readonly onMove = (event: TouchEvent): void => this.moved(event);
  private readonly onEnd = (event: TouchEvent): void => this.ended(event);
  private readonly onCancel = (): void => {
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
    this.swipe = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      at: event.timeStamp,
      pops: this.pops,
      moved: false,
      furthestX: touch.clientX,
      lastX: touch.clientX,
      lastAt: event.timeStamp,
      speed: 0,
    };
  }

  private moved(event: TouchEvent): void {
    const swipe = this.swipe;
    const touch = swipe === null ? undefined : touchOf(event, swipe.id);
    if (swipe === null || touch === undefined) {
      return;
    }
    const elapsed = event.timeStamp - swipe.lastAt;
    if (elapsed > 0) {
      swipe.speed = (touch.clientX - swipe.lastX) / elapsed;
    }
    swipe.lastX = touch.clientX;
    swipe.lastAt = event.timeStamp;
    swipe.furthestX = Math.max(swipe.furthestX, touch.clientX);
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (!swipe.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) {
      swipe.moved = true;
      if (event.timeStamp - swipe.at > HOLD_BEFORE_MOVE_MS) {
        this.swipe = null;
        return;
      }
    }
    if (swipe.moved && (dx < -TAP_SLOP_PX || Math.abs(dy) > Math.abs(dx))) {
      this.swipe = null;
    }
  }

  private ended(event: TouchEvent): void {
    const swipe = this.swipe;
    const touch = swipe === null ? undefined : touchOf(event, swipe.id);
    if (swipe === null || touch === undefined) {
      return;
    }
    this.swipe = null;
    if (swipe.moved && swipe.pops === this.pops && this.isSwipeBack(swipe, touch, event)) {
      this.back();
    }
  }

  private isSwipeBack(swipe: Swipe, touch: Touch, event: TouchEvent): boolean {
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (dx <= 2 * Math.abs(dy) || touch.clientX < swipe.furthestX - TAP_SLOP_PX) {
      return false;
    }
    const width = this.document.defaultView?.innerWidth ?? 0;
    const far = dx >= Math.max(COMMIT_SHARE_OF_WIDTH * width, FLICK_MIN_PX);
    const flick =
      dx >= FLICK_MIN_PX &&
      event.timeStamp - swipe.lastAt <= FLICK_REST_MS &&
      swipe.speed >= FLICK_MIN_SPEED_PX_PER_MS;
    return far || flick;
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
