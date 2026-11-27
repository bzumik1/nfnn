import { expect, test } from './fixtures';
import {
  judgedAgainstTheKnownFindings,
  type MotionMeasure,
  type MotionMetric,
  timedBudgetOf,
  timedChecksOf,
} from './motion-known-findings';
import { knownMotionFindings, placeOf, rememberMeasure } from './motion-measures';
import {
  COLOUR_ABOVE_MAIN_AT_MOST_LEVELS,
  ENDS_LATER_THAN_MAIN_AT_MOST_MS,
  FROZEN_LONGER_THAN_MAIN_AT_MOST_FRAMES,
  JUMP_ABOVE_MAIN_AT_MOST_PX,
  LATER_THAN_MAIN_AT_MOST_FRAMES,
  SCREENCAST_COLOUR_ALLOWANCE_LEVELS,
  STEEPEST_FRAME_OF_THE_CURVE_SHARE,
  STEP_ABOVE_MAIN_AT_MOST_STEADY_STEPS,
} from './perceptible-thresholds';
import type { BudgetCheck } from './runner-speed';

export const MOTION_MEASURE_ANNOTATION = 'nfnn-motion-measure';
export const KNOWN_MOTION_FINDING_ANNOTATION = 'known motion finding';

const FRAME_AT_60_HZ_MS = 1000 / 60;

const WORSE_THAN_ITS_CEILING_AT_MOST: Record<MotionMetric, number> = {
  'first-move-ms': LATER_THAN_MAIN_AT_MOST_FRAMES * FRAME_AT_60_HZ_MS,
  'held-ms': LATER_THAN_MAIN_AT_MOST_FRAMES * FRAME_AT_60_HZ_MS,
  'first-frame-share': LATER_THAN_MAIN_AT_MOST_FRAMES * STEEPEST_FRAME_OF_THE_CURVE_SHARE,
  'step-curve-steps': STEP_ABOVE_MAIN_AT_MOST_STEADY_STEPS,
  'back-px': JUMP_ABOVE_MAIN_AT_MOST_PX,
  'still-px': JUMP_ABOVE_MAIN_AT_MOST_PX,
  'frozen-ms': FROZEN_LONGER_THAN_MAIN_AT_MOST_FRAMES * FRAME_AT_60_HZ_MS,
  'off-the-curve-frames': LATER_THAN_MAIN_AT_MOST_FRAMES,
  'under-the-finger-px': JUMP_ABOVE_MAIN_AT_MOST_PX,
  'under-the-finger-frames': LATER_THAN_MAIN_AT_MOST_FRAMES,
  'band-levels': COLOUR_ABOVE_MAIN_AT_MOST_LEVELS + SCREENCAST_COLOUR_ALLOWANCE_LEVELS,
  'ends-after-the-step-ms': ENDS_LATER_THAN_MAIN_AT_MOST_MS,
  'press-shown-ms': LATER_THAN_MAIN_AT_MOST_FRAMES * FRAME_AT_60_HZ_MS,
};

export interface TimedRow {
  readonly judged: BudgetCheck[] | null | undefined;
  readonly lagMs: number;
}

export function expectWithinTheBound(
  measure: Pick<MotionMeasure, 'metric' | 'value' | 'bound' | 'step'>,
  timedRow?: TimedRow,
): void {
  const testInfo = test.info();
  const timedChecks =
    timedRow === undefined ? undefined : timedChecksOf(timedRow.judged, measure.metric);
  const measured: MotionMeasure = {
    ...measure,
    ...placeOf(testInfo),
    allowance: Math.round(WORSE_THAN_ITS_CEILING_AT_MOST[measure.metric] * 1000) / 1000,
    ...(timedRow === undefined ? {} : { timed: true, lagMs: Math.round(timedRow.lagMs * 10) / 10 }),
  };
  rememberMeasure(testInfo, measured);
  testInfo.annotations.push({
    type: MOTION_MEASURE_ANNOTATION,
    description: JSON.stringify(measured),
  });
  if (timedChecks !== undefined) {
    const { budget, what } = timedBudgetOf(knownMotionFindings(), measured);
    timedChecks.push({
      what,
      measured: measured.value,
      budget,
      slack: measured.lagMs ?? 0,
      unit: 'ms',
    });
    return;
  }
  const verdict = judgedAgainstTheKnownFindings(knownMotionFindings(), measured);
  if (verdict.note !== null) {
    testInfo.annotations.push({ type: KNOWN_MOTION_FINDING_ANNOTATION, description: verdict.note });
  }
  expect.soft(verdict.problem, verdict.problem ?? undefined).toBeNull();
}
