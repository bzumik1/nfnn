import { DOCUMENT, Injector, untracked } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { ScrollHold } from './scroll-hold';

const PLACE_WAIT_LONGEST_MS = 3000;
const VISITOR_MOVES = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'focusin'] as const;
const LISTENING: AddEventListenerOptions = { passive: true, capture: true };

const followed = new WeakSet<Router>();
let stopWaiting: (() => void) | null = null;

export function placeOnceGrown(top: number, navigation: number, injector: Injector): void {
  const router = injector.get(Router);
  const scrollHold = injector.get(ScrollHold);
  const view = injector.get(DOCUMENT).defaultView;
  stopWaiting?.();
  if (!followed.has(router)) {
    followed.add(router);
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        stopWaiting?.();
      }
    });
  }
  if (
    view === null ||
    typeof ResizeObserver === 'undefined' ||
    untracked(router.currentNavigation) !== null ||
    router.lastSuccessfulNavigation()?.id !== navigation
  ) {
    return;
  }
  let growth: ResizeObserver | null = null;
  let timer: number | undefined;
  let restingAt = view.scrollY;
  const movedByOthers = (): void => {
    if (Math.abs(view.scrollY - restingAt) > 1) {
      stop();
    }
  };
  const placeOnceReached = (): void => {
    if (reaches(view, top)) {
      stop();
      if (!hidesFocus(view, top)) {
        scrollHold.run(() => view.scrollTo({ top, behavior: 'instant' }));
      }
    }
  };
  const stop = (): void => {
    waitForRelease();
    growth?.disconnect();
    view.clearTimeout(timer);
    VISITOR_MOVES.forEach((type) => view.removeEventListener(type, stop, LISTENING));
    view.removeEventListener('scroll', movedByOthers, LISTENING);
    if (stopWaiting === stop) {
      stopWaiting = null;
    }
  };
  stopWaiting = stop;
  const waitForRelease = scrollHold.whenReleased(() => {
    restingAt = view.scrollY;
    timer = view.setTimeout(stop, PLACE_WAIT_LONGEST_MS);
    VISITOR_MOVES.forEach((type) => view.addEventListener(type, stop, LISTENING));
    view.addEventListener('scroll', movedByOthers, LISTENING);
    growth = new ResizeObserver(placeOnceReached);
    growth.observe(view.document.body);
    placeOnceReached();
  });
}

function reaches(view: Window, top: number): boolean {
  return view.document.documentElement.scrollHeight - view.innerHeight >= top;
}

function hidesFocus(view: Window, top: number): boolean {
  const focused = view.document.activeElement;
  if (!(focused instanceof HTMLElement) || focused.closest('main') === null) {
    return false;
  }
  const box = focused.getBoundingClientRect();
  const shift = top - view.scrollY;
  return box.bottom - shift <= 0 || box.top - shift >= view.innerHeight;
}
