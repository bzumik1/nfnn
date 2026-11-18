import { nextFrame, PAGE_LAYER_CLASS, PAGE_TRANSITION_CLASS } from './page-transitions';

const HEADER = 'app-header .app-header';
const SIDE_NAVIGATION = '.side-nav-panel';
const TAB_BAR = 'app-tab-bar .tab-bar';
const STANDING_PARTS = 'app-header, .side-nav-panel, app-tab-bar';
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
  readonly lineUp: () => never[];
}

export function clipToContent(document: Document, overlay: HTMLElement): ContentArea {
  const view = document.defaultView;
  const box = (selector: string): DOMRect | null => {
    const part = document.querySelector(`.${PAGE_LAYER_CLASS} ${selector}`);
    const place = part?.getBoundingClientRect() ?? null;
    return place !== null && place.height > 0 ? place : null;
  };
  const top = Math.max(0, box(HEADER)?.bottom ?? 0);
  const start = Math.max(0, box(SIDE_NAVIGATION)?.right ?? 0);
  const tabBar = box(TAB_BAR);
  const bottom = tabBar === null ? 0 : Math.max(0, (view?.innerHeight ?? 0) - tabBar.top);
  overlay.classList.add(`${PAGE_TRANSITION_CLASS}--content`);
  overlay.style.inset = `${top}px 0 ${bottom}px ${start}px`;
  return {
    width: (view?.innerWidth ?? 0) - start,
    lineUp: () => {
      overlay
        .querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__scroller`)
        .forEach((scroller) => (scroller.style.inset = `${-top}px 0 ${-bottom}px ${-start}px`));
      overlay
        .querySelectorAll<HTMLElement>(STANDING_PARTS)
        .forEach((part) => (part.style.visibility = 'hidden'));
      overlay
        .querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`)
        .forEach((page) => (page.style.borderRadius = '0'));
      return [];
    },
  };
}
