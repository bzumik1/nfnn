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

export interface StandingPage {
  readonly at: number;
  readonly stepPx: number;
  readonly frameMs: number;
  readonly stepAtMostPx: number;
  readonly width: number;
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
const EASING_HALVINGS = 40;
const SETTLE_LONGEST_MS = 3 * SETTLE_MAX_MS;
const SETTLE_TRIES = 60;
const FIRST_STEP_MARGIN = 0.98;
const SETTLE_LENGTHENED_BY = 1.1;

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

export function settleFrom(end: SwipeSettle, page: StandingPage): SwipeSettle {
  if (page.at === end.from || page.stepAtMostPx <= 0) {
    return end;
  }
  const distance = Math.abs(end.to - page.at);
  if (distance === 0) {
    return { ...end, from: page.at, durationMs: 0, easing: easingLeavingAt(0), speed: 0 };
  }
  const stepTowards = Math.max(0, Math.sign(end.to - page.at) * page.stepPx);
  let speed = Math.min(end.speed ?? 0, stepTowards / page.frameMs);
  const firstAtMost = Math.max(stepTowards, page.stepAtMostPx);
  const anyAtMost = Math.max(firstAtMost, steepestStep(end, page.frameMs));
  let durationMs = clamp(
    distance / Math.max(speed, page.width / SETTLE_MAX_MS),
    SETTLE_MIN_MS,
    SETTLE_MAX_MS,
  );
  for (let tries = 0; tries < SETTLE_TRIES; tries++) {
    const steps = stepsOf(distance, durationMs, (speed * durationMs) / distance, page.frameMs);
    if (Math.max(...steps) > anyAtMost && durationMs < SETTLE_LONGEST_MS) {
      durationMs = Math.min(SETTLE_LONGEST_MS, durationMs * SETTLE_LENGTHENED_BY);
    } else if (steps[0] > firstAtMost) {
      speed *= (firstAtMost / steps[0]) * FIRST_STEP_MARGIN;
    } else {
      break;
    }
  }
  return {
    ...end,
    from: page.at,
    durationMs,
    easing: easingLeavingAt((speed * durationMs) / distance),
    speed,
  };
}

function steepestStep(settle: SwipeSettle, frameMs: number): number {
  const distance = Math.abs(settle.to - settle.from);
  if (distance === 0 || settle.durationMs === 0) {
    return 0;
  }
  const slope = ((settle.speed ?? 0) * settle.durationMs) / distance;
  return Math.max(...stepsOf(distance, settle.durationMs, slope, frameMs));
}

function stepsOf(distance: number, durationMs: number, slope: number, frameMs: number): number[] {
  const y1 = Math.min(1, slope * EASING_START_X);
  const at = (frame: number): number =>
    distance * easedAt(y1, Math.min(1, (frame * frameMs) / durationMs));
  const steps: number[] = [];
  for (let frame = 1; (frame - 1) * frameMs < durationMs; frame++) {
    steps.push(at(frame) - at(frame - 1));
  }
  return steps;
}

function easedAt(y1: number, x: number): number {
  let low = 0;
  let high = 1;
  for (let halving = 0; halving < EASING_HALVINGS; halving++) {
    const middle = (low + high) / 2;
    if (bezierAt(EASING_START_X, EASING_START_X, middle) < x) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return bezierAt(y1, 1, (low + high) / 2);
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
