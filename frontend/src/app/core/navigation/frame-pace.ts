export const LATE_FRAME_PAST_THE_STEADY_ONE = 1.5;
export const RETIMED_WITHIN_MS = 175;
export const RETIMED_AT_MOST_MS = 150;
export const STEADY_FRAME_SHORTEST_MS = 8;
export const STEADY_FRAME_LONGEST_MS = 34;
export const STEADY_FRAMES_KEPT = 10;
export const STEADY_GAPS_IN_MOTION = 3;

export interface FrameShown {
  readonly gapMs: number;
  readonly steadyMs: number;
  readonly shownMs: number;
  readonly shiftedMs: number;
}

export function steadyFrameMs(gaps: readonly number[]): number {
  return gaps.length === 0 ? STEADY_FRAME_LONGEST_MS : bounded(medianOf(gaps));
}

export function steadyFrameInMotion(
  steadyBeforeMs: number,
  gapsInMotion: readonly number[],
): number {
  if (gapsInMotion.length < STEADY_GAPS_IN_MOTION) {
    return bounded(steadyBeforeMs);
  }
  return bounded(Math.max(steadyBeforeMs, medianOf(gapsInMotion.slice(-STEADY_GAPS_IN_MOTION))));
}

export function retimingOf({ gapMs, steadyMs, shownMs, shiftedMs }: FrameShown): number {
  if (shownMs >= RETIMED_WITHIN_MS || gapMs <= steadyMs * LATE_FRAME_PAST_THE_STEADY_ONE) {
    return 0;
  }
  return Math.max(0, Math.min(gapMs - steadyMs, RETIMED_AT_MOST_MS - shiftedMs));
}

function medianOf(gaps: readonly number[]): number {
  const sorted = [...gaps].sort((one, other) => one - other);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function bounded(gapMs: number): number {
  return Math.min(STEADY_FRAME_LONGEST_MS, Math.max(STEADY_FRAME_SHORTEST_MS, gapMs));
}
