import { DOCUMENT, Injector, untracked } from '@angular/core';
import { NavigationStart, Router, Scroll } from '@angular/router';
import { PageFocus } from './page-focus';
import { ScrollHold } from './scroll-hold';

const PLACE_WAIT_LONGEST_MS = 3000;
const VISITOR_MOVES = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
const LISTENING: AddEventListenerOptions = { passive: true, capture: true };

const followed = new WeakSet<Router>();
let stopWaiting: (() => void) | null = null;

export function placeOnceGrown(restored: Scroll, injector: Injector, placed: () => void): void {
  const top = restored.position?.[1] ?? 0;
  const router = injector.get(Router);
  const scrollHold = injector.get(ScrollHold);
  const pageFocus = injector.get(PageFocus);
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
    router.lastSuccessfulNavigation()?.id !== restored.routerEvent.id
  ) {
    placed();
    return;
  }
  let growth: ResizeObserver | null = null;
  let timer: number | undefined;
  let restingAt = view.scrollY;
  let waitForRelease = (): void => undefined;
  const focusMoved = (event: Event): void => {
    if (!(event.target instanceof Element) || !landsOnArrival(event.target, pageFocus)) {
      stop();
    }
  };
  const movedByOthers = (): void => {
    if (Math.abs(view.scrollY - restingAt) > 1) {
      stop();
    }
  };
  const placeOnceReached = (): void => {
    if (reaches(view, top)) {
      if (!hidesFocus(view, top, pageFocus)) {
        scrollHold.run(() => view.scrollTo({ top, behavior: 'instant' }));
      }
      stop();
    }
  };
  const stop = (): void => {
    placed();
    waitForRelease();
    growth?.disconnect();
    view.clearTimeout(timer);
    VISITOR_MOVES.forEach((type) => view.removeEventListener(type, stop, LISTENING));
    view.removeEventListener('focusin', focusMoved, LISTENING);
    view.removeEventListener('scroll', movedByOthers, LISTENING);
    if (stopWaiting === stop) {
      stopWaiting = null;
    }
  };
  stopWaiting = stop;
  waitForRelease = scrollHold.whenReleased(() => {
    restingAt = view.scrollY;
    timer = view.setTimeout(stop, PLACE_WAIT_LONGEST_MS);
    VISITOR_MOVES.forEach((type) => view.addEventListener(type, stop, LISTENING));
    view.addEventListener('focusin', focusMoved, LISTENING);
    view.addEventListener('scroll', movedByOthers, LISTENING);
    growth = new ResizeObserver(placeOnceReached);
    growth.observe(view.document.body);
    placeOnceReached();
  });
}

function reaches(view: Window, top: number): boolean {
  return view.document.documentElement.scrollHeight - view.innerHeight >= top;
}

function landsOnArrival(element: Element, pageFocus: PageFocus): boolean {
  const main = element.closest('main');
  return (
    main instanceof HTMLElement &&
    (element === main || element === main.querySelector('h1')) &&
    pageFocus.returnTargetIn(main) !== null
  );
}

function focusKept(view: Window, pageFocus: PageFocus): HTMLElement | null {
  const focused = view.document.activeElement;
  const main = focused?.closest('main');
  if (!(focused instanceof HTMLElement) || !(main instanceof HTMLElement)) {
    return null;
  }
  return landsOnArrival(focused, pageFocus) ? pageFocus.returnTargetIn(main) : focused;
}

function hidesFocus(view: Window, top: number, pageFocus: PageFocus): boolean {
  const focused = focusKept(view, pageFocus);
  if (focused === null) {
    return false;
  }
  const box = focused.getBoundingClientRect();
  const shift = top - view.scrollY;
  const hiddenAfter = box.bottom - shift <= 0 || box.top - shift >= view.innerHeight;
  const leavesAtTop = box.top >= 0 && box.top - shift < 0;
  const leavesAtBottom = box.bottom <= view.innerHeight && box.bottom - shift > view.innerHeight;
  return hiddenAfter || leavesAtTop || leavesAtBottom;
}
