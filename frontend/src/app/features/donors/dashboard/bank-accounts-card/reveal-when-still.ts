import { scrollIntoViewFitting } from '../../../../shared/ui/leaving-row/leaving-row';

const VISITOR_MOVES = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'] as const;
const LISTENING: AddEventListenerOptions = { capture: true, passive: true };
const STILL_FRAMES = 3;
const REVEALS = 3;
const WATCH_LONGEST_MS = 3000;
const SUBPIXEL_PX = 0.5;

export function revealWhenStill(
  document: Document,
  control: HTMLElement,
  motions: readonly Animation[],
): void {
  const view = document.defaultView;
  if (view === null || typeof view.requestAnimationFrame !== 'function') {
    return;
  }
  const scroller = scrollerOf(document, control, view);
  const started = view.performance.now();
  let moved = false;
  const heard = (): void => {
    moved = true;
  };
  const stop = (): void => {
    for (const type of VISITOR_MOVES) {
      document.removeEventListener(type, heard, LISTENING);
    }
  };
  for (const type of VISITOR_MOVES) {
    document.addEventListener(type, heard, LISTENING);
  }
  let reveals = 0;
  let lastTop = Number.NaN;
  let stillFrames = 0;
  const look = (): void => {
    if (
      moved ||
      document.activeElement !== control ||
      !control.isConnected ||
      view.performance.now() - started > WATCH_LONGEST_MS
    ) {
      stop();
      return;
    }
    const top = scroller.scrollTop;
    stillFrames = Math.abs(top - lastTop) <= SUBPIXEL_PX ? stillFrames + 1 : 0;
    lastTop = top;
    if (stillFrames < STILL_FRAMES) {
      view.requestAnimationFrame(look);
      return;
    }
    if (whollyInView(document, scroller, control, view) || reveals >= REVEALS) {
      stop();
      return;
    }
    reveals += 1;
    stillFrames = 0;
    scrollIntoViewFitting(control, document);
    view.requestAnimationFrame(look);
  };
  void Promise.allSettled(motions.map((motion) => motion.finished)).then(() =>
    view.requestAnimationFrame(look),
  );
}

function scrollerOf(document: Document, control: HTMLElement, view: Window): Element {
  for (let node = control.parentElement; node !== null; node = node.parentElement) {
    if (/(auto|scroll)/.test(view.getComputedStyle(node).overflowY)) {
      return node;
    }
  }
  return document.scrollingElement ?? document.documentElement;
}

function whollyInView(
  document: Document,
  scroller: Element,
  control: HTMLElement,
  view: Window,
): boolean {
  const padding = view.getComputedStyle(scroller);
  const paddingTop = parseFloat(padding.scrollPaddingTop) || 0;
  const paddingBottom = parseFloat(padding.scrollPaddingBottom) || 0;
  const pageScrolls = scroller === document.scrollingElement;
  const box = pageScrolls ? { top: 0, bottom: view.innerHeight } : scroller.getBoundingClientRect();
  const placed = control.getBoundingClientRect();
  return (
    placed.top >= box.top + paddingTop - SUBPIXEL_PX &&
    placed.bottom <= box.bottom - paddingBottom + SUBPIXEL_PX
  );
}
