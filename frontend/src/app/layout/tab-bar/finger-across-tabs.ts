export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface FingerAcrossTabsHandlers {
  readonly started: () => void;
  readonly moved: (index: number | null) => void;
  readonly released: (index: number | null) => void;
}

const TAP_SLOP_PX = 10;
const LEAVE_ABOVE_BAR_PX = 24;
const SAME_ROW_PX = 1;
const PASSIVE: AddEventListenerOptions = { passive: true };

export function hasLeftTap(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > TAP_SLOP_PX;
}

export function tabUnderFinger(
  x: number,
  y: number,
  bar: Box,
  tabs: readonly Box[],
): number | null {
  if (tabs.length === 0 || y < bar.top - LEAVE_ABOVE_BAR_PX) {
    return null;
  }
  return nearestTab(clamp(x, bar.left, bar.right), clamp(y, bar.top, bar.bottom), tabs);
}

export function pillCentre(
  x: number,
  tab: Box,
  tabs: readonly Box[],
  followsFinger: boolean,
): Point {
  const centre = centreOf(tab);
  if (!followsFinger) {
    return centre;
  }
  const row = tabs.filter((other) => Math.abs(other.top - tab.top) < SAME_ROW_PX);
  const halfWidth = (tab.right - tab.left) / 2;
  const first = Math.min(...row.map((other) => other.left)) + halfWidth;
  const last = Math.max(...row.map((other) => other.right)) - halfWidth;
  return { x: clamp(x, first, last), y: centre.y };
}

export function followFingerAcrossTabs(
  bar: HTMLElement,
  pill: HTMLElement,
  handlers: FingerAcrossTabsHandlers,
): () => void {
  const view = bar.ownerDocument.defaultView;
  if (view === null) {
    return () => undefined;
  }
  let gesture: Gesture | null = null;

  const moved = (event: PointerEvent): void => {
    const current = gesture;
    if (current === null || event.pointerId !== current.pointerId) {
      return;
    }
    current.finger = { x: event.clientX, y: event.clientY };
    if (current.layout === null) {
      if (!hasLeftTap(event.clientX - current.start.x, event.clientY - current.start.y)) {
        return;
      }
      current.layout = measure(bar, view);
    }
    if (current.frame === null) {
      current.frame = view.requestAnimationFrame(() => {
        current.frame = null;
        follow(current, pill, handlers);
      });
    }
  };

  const released = (event: PointerEvent): void => {
    const current = gesture;
    if (current === null || event.pointerId !== current.pointerId) {
      return;
    }
    finish();
    if (current.layout !== null) {
      if (!current.shown) {
        handlers.started();
      }
      handlers.released(chosenTab({ x: event.clientX, y: event.clientY }, current.layout));
    }
  };

  const cancelled = (event: PointerEvent): void => {
    const current = gesture;
    if (current === null || event.pointerId !== current.pointerId) {
      return;
    }
    finish();
    if (current.shown) {
      handlers.released(null);
    }
  };

  const pressed = (event: PointerEvent): void => {
    if (
      gesture !== null ||
      !event.isPrimary ||
      event.pointerType === 'mouse' ||
      event.button !== 0
    ) {
      return;
    }
    gesture = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      finger: { x: event.clientX, y: event.clientY },
      layout: null,
      frame: null,
      sizedFor: null,
      under: undefined,
      shown: false,
    };
    view.addEventListener('pointermove', moved, PASSIVE);
    view.addEventListener('pointerup', released, PASSIVE);
    view.addEventListener('pointercancel', cancelled, PASSIVE);
  };

  function finish(): void {
    if (gesture?.frame != null) {
      view?.cancelAnimationFrame(gesture.frame);
    }
    gesture = null;
    view?.removeEventListener('pointermove', moved, PASSIVE);
    view?.removeEventListener('pointerup', released, PASSIVE);
    view?.removeEventListener('pointercancel', cancelled, PASSIVE);
  }

  bar.addEventListener('pointerdown', pressed, PASSIVE);
  return () => {
    const current = gesture;
    finish();
    if (current?.shown === true) {
      handlers.released(null);
    }
    bar.removeEventListener('pointerdown', pressed, PASSIVE);
  };
}

interface Layout {
  readonly bar: Box;
  readonly tabs: readonly Box[];
  readonly origin: Point;
  readonly followsFinger: boolean;
}

interface Gesture {
  readonly pointerId: number;
  readonly start: Point;
  finger: Point;
  layout: Layout | null;
  frame: number | null;
  sizedFor: number | null;
  under: number | null | undefined;
  shown: boolean;
}

function measure(bar: HTMLElement, view: Window): Layout {
  const box = bar.getBoundingClientRect();
  const tabs = Array.from(bar.querySelectorAll<HTMLElement>('.tab'), (tab) =>
    boxOf(tab.getBoundingClientRect()),
  );
  return {
    bar: boxOf(box),
    tabs,
    origin: { x: box.left + bar.clientLeft, y: box.top + bar.clientTop },
    followsFinger: !view.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

function follow(gesture: Gesture, pill: HTMLElement, handlers: FingerAcrossTabsHandlers): void {
  const layout = gesture.layout;
  if (layout === null) {
    return;
  }
  const under = chosenTab(gesture.finger, layout);
  if (under !== gesture.under) {
    gesture.under = under;
    handlers.moved(under);
  }
  const nearest = tabUnderFinger(
    gesture.finger.x,
    Math.max(gesture.finger.y, layout.bar.top),
    layout.bar,
    layout.tabs,
  );
  if (nearest === null) {
    return;
  }
  const tab = layout.tabs[nearest];
  const width = tab.right - tab.left;
  const height = tab.bottom - tab.top;
  if (gesture.sizedFor !== nearest) {
    gesture.sizedFor = nearest;
    pill.style.width = `${width}px`;
    pill.style.height = `${height}px`;
  }
  const centre = pillCentre(gesture.finger.x, tab, layout.tabs, layout.followsFinger);
  const x = centre.x - width / 2 - layout.origin.x;
  const y = centre.y - height / 2 - layout.origin.y;
  pill.style.translate = `${x}px ${y}px`;
  if (!gesture.shown) {
    gesture.shown = true;
    handlers.started();
  }
}

function chosenTab(finger: Point, layout: Layout): number | null {
  return tabUnderFinger(finger.x, finger.y, layout.bar, layout.tabs);
}

function nearestTab(x: number, y: number, tabs: readonly Box[]): number {
  let nearest = 0;
  let shortest = Number.POSITIVE_INFINITY;
  tabs.forEach((tab, index) => {
    const distance = Math.hypot(
      x - clamp(x, tab.left, tab.right),
      y - clamp(y, tab.top, tab.bottom),
    );
    if (distance < shortest) {
      shortest = distance;
      nearest = index;
    }
  });
  return nearest;
}

function centreOf(box: Box): Point {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

function boxOf(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
