export interface SwipePoint {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

export interface SwipeSettle {
  readonly completes: boolean;
  readonly from: number;
  readonly to: number;
  readonly durationMs: number;
  readonly easing: string;
}

const TAP_SLOP_PX = 10;
const HOLD_BEFORE_MOVE_MS = 500;
const ACROSS_OVER_DOWN = 1.5;
const FLICK_REST_MS = 100;
const PROJECTION_MS = 500;
const SMALLEST_STEP_PX = 40;
const HEADING_BACK_PX_PER_MS = 0.3;
const SETTLE_MIN_MS = 150;
const SETTLE_MAX_MS = 350;
const EASING_START_X = 0.25;

type Phase = 'tracking' | 'dragging' | 'abandoned';

export class BackSwipe {
  private phase: Phase = 'tracking';
  private last: SwipePoint;
  private speed = 0;
  private x: number;

  constructor(
    private readonly start: SwipePoint,
    private readonly width: number,
  ) {
    this.last = start;
    this.x = start.x;
  }

  get dragging(): boolean {
    return this.phase === 'dragging';
  }

  get abandoned(): boolean {
    return this.phase === 'abandoned';
  }

  get offset(): number {
    return this.dragging ? this.offsetAt(this.x) : 0;
  }

  move(point: SwipePoint): void {
    if (this.abandoned) {
      return;
    }
    const elapsed = point.at - this.last.at;
    if (elapsed > 0) {
      this.speed = (point.x - this.last.x) / elapsed;
    }
    this.last = point;
    this.x = point.x;
    if (this.phase === 'tracking') {
      this.phase = this.lockedBy(point);
    }
  }

  release(point: SwipePoint): SwipeSettle | null {
    if (!this.dragging) {
      return null;
    }
    const speed = point.at - this.last.at > FLICK_REST_MS ? 0 : this.speed;
    const from = this.offsetAt(point.x);
    const completes =
      from >= SMALLEST_STEP_PX &&
      speed > -HEADING_BACK_PX_PER_MS &&
      from + speed * PROJECTION_MS >= this.width / 2;
    const to = completes ? this.width : 0;
    const distance = Math.abs(to - from);
    const towards = Math.max(0, completes ? speed : -speed);
    if (distance === 0) {
      return { completes, from, to, durationMs: 0, easing: easingLeavingAt(0) };
    }
    const durationMs = clamp(
      distance / Math.max(towards, this.width / SETTLE_MAX_MS),
      SETTLE_MIN_MS,
      SETTLE_MAX_MS,
    );
    const startSlope = (towards * durationMs) / distance;
    return { completes, from, to, durationMs, easing: easingLeavingAt(startSlope) };
  }

  private lockedBy(point: SwipePoint): Phase {
    const dx = point.x - this.start.x;
    const dy = point.y - this.start.y;
    if (Math.hypot(dx, dy) <= TAP_SLOP_PX) {
      return 'tracking';
    }
    if (point.at - this.start.at > HOLD_BEFORE_MOVE_MS) {
      return 'abandoned';
    }
    return dx > 0 && dx > ACROSS_OVER_DOWN * Math.abs(dy) ? 'dragging' : 'abandoned';
  }

  private offsetAt(x: number): number {
    return clamp(x - this.start.x, 0, this.width);
  }
}

function easingLeavingAt(slope: number): string {
  const y1 = Math.min(1, slope * EASING_START_X);
  return `cubic-bezier(${EASING_START_X}, ${Math.round(y1 * 1000) / 1000}, ${EASING_START_X}, 1)`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
