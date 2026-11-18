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
      view.requestAnimationFrame(closeIn);
    }
  };
  view.requestAnimationFrame(closeIn);
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
