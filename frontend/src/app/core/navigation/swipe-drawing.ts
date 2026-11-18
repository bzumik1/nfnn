import { nextFrame, PAGE_LAYER_CLASS, PAGE_TRANSITION_CLASS } from './page-transitions';

const HEADER = 'app-header .app-header';
const SIDE_NAVIGATION = '.side-nav-panel';
const CATCH_UP_SPANS = 3;
const FRAME_MS = 16;

export interface CatchUp {
  readonly finger: () => number;
  readonly from: number;
  readonly show: (offset: number) => void;
  readonly goesOn: () => boolean;
  readonly caughtUp: () => void;
}

export function closeInOnFinger(view: Window, fastMs: number, catchUp: CatchUp): void {
  const closing = Math.max(1, fastMs / CATCH_UP_SPANS);
  let last: number | null = null;
  let gap = catchUp.finger() - catchUp.from;
  const closeIn = (now: number): void => {
    if (!catchUp.goesOn()) {
      return;
    }
    const elapsed = last === null ? FRAME_MS : Math.max(0, now - last);
    last = now;
    gap *= Math.exp(-elapsed / closing);
    if (Math.abs(gap) < 1) {
      gap = 0;
    }
    catchUp.show(catchUp.finger() - gap);
    if (gap === 0) {
      catchUp.caughtUp();
    } else {
      nextFrame(view, closeIn);
    }
  };
  nextFrame(view, closeIn);
}

export async function withoutFocus<T>(
  document: Document,
  layer: HTMLElement | null,
  draw: () => Promise<T>,
): Promise<T> {
  const focused = document.activeElement;
  layer?.setAttribute('inert', '');
  try {
    return await draw();
  } finally {
    layer?.removeAttribute('inert');
    if (
      focused instanceof HTMLElement &&
      focused.isConnected &&
      focused !== document.body &&
      document.activeElement !== focused
    ) {
      focused.focus({ preventScroll: true });
    }
  }
}

export function standSheetsAtOnce(document: Document): void {
  document.querySelectorAll('dialog[open]').forEach((sheet) =>
    sheet
      .getAnimations?.({ subtree: true })
      .filter((motion) => motion.effect?.getComputedTiming().endTime !== Infinity)
      .forEach((motion) => motion.finish()),
  );
}

export interface ContentArea {
  readonly width: number;
  readonly lineUp: () => void;
}

export function clipToContent(document: Document, overlay: HTMLElement): ContentArea {
  const header = document.querySelector(`.${PAGE_LAYER_CLASS} ${HEADER}`);
  const sideNavigation = document.querySelector(`.${PAGE_LAYER_CLASS} ${SIDE_NAVIGATION}`);
  const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
  const start = Math.max(0, sideNavigation?.getBoundingClientRect().right ?? 0);
  overlay.classList.add(`${PAGE_TRANSITION_CLASS}--content`);
  overlay.style.inset = `${top}px 0 0 ${start}px`;
  return {
    width: (document.defaultView?.innerWidth ?? 0) - start,
    lineUp: () =>
      overlay
        .querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__scroller`)
        .forEach((scroller) => (scroller.style.inset = `${-top}px 0 0 ${-start}px`)),
  };
}
