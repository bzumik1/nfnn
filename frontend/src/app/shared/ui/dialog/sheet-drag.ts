import { isTextEntry } from '../../../core/layout/soft-keyboard';

export type SheetRelease = 'dismiss' | 'return';

export type PullIntent = 'undecided' | 'sheet' | 'content';

export interface TouchOrigin {
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

const MINIMUM_CLOSING_DISTANCE_PX = 72;
const CLOSING_SHARE_OF_HEIGHT = 0.25;
const FLICK_SPEED_PX_PER_MS = 0.5;
const FLICK_DISTANCE_PX = 24;
const FLICK_REST_MS = 100;
const CHANGED_MIND_SPEED_PX_PER_MS = 0.1;
const RESISTANCE_REACH_PX = 96;
const RESISTANCE_STIFFNESS = 0.55;
const PULL_SLOP_PX = 10;
const PULL_STEEPNESS = 1.2;
const LONG_PRESS_MS = 300;
const OWN_GESTURES =
  'textarea, select, input[type="range"], canvas, [contenteditable]:not([contenteditable="false"]), app-zoomable';

export class SheetDrag {
  private startY: number | null = null;
  private offset = 0;
  private lastY = 0;
  private lastTime = 0;
  private speed = 0;
  private resists = false;

  start(y: number, time: number, resists = false): void {
    this.startY = y;
    this.offset = 0;
    this.lastY = y;
    this.lastTime = time;
    this.speed = 0;
    this.resists = resists;
  }

  move(y: number, time: number): number {
    if (this.startY === null) {
      return 0;
    }
    const elapsed = time - this.lastTime;
    if (elapsed > 0) {
      this.speed = (y - this.lastY) / elapsed;
    }
    this.lastY = y;
    this.lastTime = time;
    this.offset = Math.max(0, y - this.startY);
    return this.resists ? rubberBand(this.offset) : this.offset;
  }

  cancel(): void {
    this.startY = null;
    this.offset = 0;
  }

  end(height: number, time: number): SheetRelease {
    const offset = this.offset;
    const dragging = this.startY !== null;
    this.cancel();
    if (!dragging) {
      return 'return';
    }
    const moving = time - this.lastTime <= FLICK_REST_MS;
    if (moving && this.speed <= -CHANGED_MIND_SPEED_PX_PER_MS) {
      return 'return';
    }
    const closingDistance = Math.max(MINIMUM_CLOSING_DISTANCE_PX, height * CLOSING_SHARE_OF_HEIGHT);
    const flicked = moving && this.speed >= FLICK_SPEED_PX_PER_MS && offset >= FLICK_DISTANCE_PX;
    return offset >= closingDistance || flicked ? 'dismiss' : 'return';
  }
}

export function rubberBand(distance: number): number {
  return (
    RESISTANCE_REACH_PX * (1 - 1 / ((distance * RESISTANCE_STIFFNESS) / RESISTANCE_REACH_PX + 1))
  );
}

export function pullIntent(origin: TouchOrigin, x: number, y: number, time: number): PullIntent {
  const across = x - origin.x;
  const down = y - origin.y;
  if (Math.hypot(across, down) < PULL_SLOP_PX) {
    return 'undecided';
  }
  if (time - origin.time > LONG_PRESS_MS) {
    return 'content';
  }
  return down > 0 && down > Math.abs(across) * PULL_STEEPNESS ? 'sheet' : 'content';
}

export function canPullSheetFrom(target: Element, panel: HTMLElement): boolean {
  const document = panel.ownerDocument;
  if (target.closest(OWN_GESTURES) !== null) {
    return false;
  }
  if (target === document.activeElement && isTextEntry(target)) {
    return false;
  }
  const selection = document.getSelection();
  if (selection !== null && !selection.isCollapsed) {
    return false;
  }
  for (let element: Element | null = target; element !== null; element = element.parentElement) {
    if (element.scrollTop > 0) {
      return false;
    }
    if (element === panel) {
      return true;
    }
  }
  return false;
}
