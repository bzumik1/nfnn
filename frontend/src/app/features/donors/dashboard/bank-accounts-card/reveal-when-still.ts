import {
  scrollerOf,
  scrollIntoViewFitting,
  visibleBandOf,
} from '../../../../shared/ui/leaving-row/leaving-row';

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
  let started = Number.NaN;
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
    const top = control.getBoundingClientRect().top;
    stillFrames = Math.abs(top - lastTop) <= SUBPIXEL_PX ? stillFrames + 1 : 0;
    lastTop = top;
    if (
      stillFrames >= STILL_FRAMES &&
      reveals < REVEALS &&
      !whollyInView(document, control, view)
    ) {
      reveals += 1;
      stillFrames = 0;
      scrollIntoViewFitting(control, document);
    }
    view.requestAnimationFrame(look);
  };
  void Promise.allSettled(motions.map((motion) => motion.finished)).then(() => {
    started = view.performance.now();
    view.requestAnimationFrame(look);
  });
}

function whollyInView(document: Document, control: HTMLElement, view: Window): boolean {
  const band = visibleBandOf(document, scrollerOf(document, control, view), view);
  const placed = control.getBoundingClientRect();
  return (
    placed.top >= Math.max(band.top, 0) - SUBPIXEL_PX &&
    placed.bottom <= Math.min(band.bottom, view.innerHeight) + SUBPIXEL_PX
  );
}
