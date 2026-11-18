import type { ScrollHold } from './scroll-hold';

const PLACE_WAIT_LONGEST_MS = 3000;
const VISITOR_MOVES = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'focusin'] as const;
const LISTENING: AddEventListenerOptions = { passive: true, capture: true };

export interface GrowingPage {
  readonly view: Window;
  readonly scrollHold: ScrollHold;
  readonly scrollTo: (top: number) => void;
}

export function placeOnceGrown(top: number, page: GrowingPage): () => void {
  const { view, scrollHold } = page;
  const document = view.document;
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
        page.scrollTo(top);
      }
    }
  };
  const stop = (): void => {
    waitForRelease();
    growth?.disconnect();
    view.clearTimeout(timer);
    VISITOR_MOVES.forEach((type) => view.removeEventListener(type, stop, LISTENING));
    view.removeEventListener('scroll', movedByOthers, LISTENING);
  };
  const waitForRelease = scrollHold.whenReleased(() => {
    restingAt = view.scrollY;
    timer = view.setTimeout(stop, PLACE_WAIT_LONGEST_MS);
    VISITOR_MOVES.forEach((type) => view.addEventListener(type, stop, LISTENING));
    view.addEventListener('scroll', movedByOthers, LISTENING);
    growth = new ResizeObserver(placeOnceReached);
    growth.observe(document.body);
    placeOnceReached();
  });
  return stop;
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
