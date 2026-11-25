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
  readonly speed?: number;
}

export type Curve = readonly [number, number, number, number];

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
const EASING_HALVINGS = 40;
const SAMPLED_EVERY_MS = 1;
const NAMED_CURVES: Readonly<Record<string, Curve>> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

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
      return { completes, from, to, durationMs: 0, easing: easingLeavingAt(0), speed: towards };
    }
    const durationMs = clamp(
      distance / Math.max(towards, this.width / SETTLE_MAX_MS),
      SETTLE_MIN_MS,
      SETTLE_MAX_MS,
    );
    const startSlope = (towards * durationMs) / distance;
    return {
      completes,
      from,
      to,
      durationMs,
      easing: easingLeavingAt(startSlope),
      speed: towards,
    };
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

export function settleFrom(end: SwipeSettle, at: number, width: number): SwipeSettle {
  const distance = Math.abs(end.to - at);
  if (end.speed === undefined || distance === 0) {
    return { ...end, from: at, durationMs: distance === 0 ? 0 : end.durationMs };
  }
  const durationMs = clamp(
    distance / Math.max(end.speed, width / SETTLE_MAX_MS),
    SETTLE_MIN_MS,
    SETTLE_MAX_MS,
  );
  return {
    ...end,
    from: at,
    durationMs,
    easing: easingLeavingAt((end.speed * durationMs) / distance),
  };
}

export function curveOf(easing: string): Curve {
  const named = NAMED_CURVES[easing];
  if (named !== undefined) {
    return named;
  }
  const points = /cubic-bezier\(([^)]*)\)/.exec(easing)?.[1].split(',').map(Number);
  return points?.length === 4 && points.every(Number.isFinite)
    ? [points[0], points[1], points[2], points[3]]
    : NAMED_CURVES['ease'];
}

export function easedAt([x1, y1, x2, y2]: Curve, x: number): number {
  const along = Math.min(1, Math.max(0, x));
  let low = 0;
  let high = 1;
  for (let halving = 0; halving < EASING_HALVINGS; halving++) {
    const middle = (low + high) / 2;
    if (bezierAt(x1, x2, middle) < along) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return bezierAt(y1, y2, (low + high) / 2);
}

export function steepestStepOver(settle: SwipeSettle, stepMs: number): number {
  if (settle.durationMs <= 0) {
    return Math.abs(settle.to - settle.from);
  }
  const curve = curveOf(settle.easing);
  const way = Math.abs(settle.to - settle.from);
  let steepest = 0;
  for (let at = 0; at < settle.durationMs; at += SAMPLED_EVERY_MS) {
    const step =
      easedAt(curve, (at + stepMs) / settle.durationMs) - easedAt(curve, at / settle.durationMs);
    steepest = Math.max(steepest, way * step);
  }
  return steepest;
}

function bezierAt(first: number, second: number, t: number): number {
  return 3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;
}

export function easingLeavingAt(slope: number): string {
  const y1 = Math.min(1, slope * EASING_START_X);
  return `cubic-bezier(${EASING_START_X}, ${Math.round(y1 * 1000) / 1000}, ${EASING_START_X}, 1)`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
