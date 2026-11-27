export const MOTION_METRICS = [
  'first-move-ms',
  'held-ms',
  'first-frame-share',
  'step-curve-steps',
  'back-px',
  'still-px',
  'frozen-ms',
  'off-the-curve-frames',
  'under-the-finger-px',
  'under-the-finger-frames',
  'band-levels',
  'ends-after-the-step-ms',
  'press-shown-ms',
] as const;

export type MotionMetric = (typeof MOTION_METRICS)[number];

export interface MotionKnownFinding {
  readonly project: string;
  readonly file: string;
  readonly test: string;
  readonly step?: string;
  readonly metric: MotionMetric;
  readonly recorded: number;
  readonly everyRun: boolean;
  readonly issue: number;
}

export interface MotionMeasure {
  readonly project: string;
  readonly file: string;
  readonly test: string;
  readonly step?: string;
  readonly metric: MotionMetric;
  readonly value: number;
  readonly bound: number;
}

export interface MotionVerdict {
  readonly problem: string | null;
  readonly note: string | null;
}

export const REGISTRY = 'motion-known-findings.json';

const covers = (finding: MotionKnownFinding, measure: MotionMeasure): boolean =>
  finding.project === measure.project &&
  finding.file === measure.file &&
  finding.test === measure.test &&
  finding.metric === measure.metric &&
  (finding.step ?? null) === (measure.step ?? null);

export function judgedAgainstTheKnownFindings(
  findings: readonly MotionKnownFinding[],
  measure: MotionMeasure,
): MotionVerdict {
  const at = measure.step === undefined ? '' : ` at ${measure.step}`;
  const shown = `${measure.metric} ${measure.value}${at}`;
  const known = findings.find((finding) => covers(finding, measure));
  if (measure.value <= measure.bound) {
    if (known === undefined) {
      return { problem: null, note: null };
    }
    return known.everyRun
      ? {
          problem: `${shown} is within its bound ${measure.bound}: the known finding #${known.issue} no longer breaches, so remove its entry from ${REGISTRY}`,
          note: null,
        }
      : {
          problem: null,
          note: `the known finding #${known.issue} did not breach in this run: ${shown}, bound ${measure.bound}`,
        };
  }
  if (known === undefined) {
    return { problem: `${shown} is past its bound ${measure.bound}`, note: null };
  }
  if (measure.value > known.recorded) {
    return {
      problem: `${shown} is past its bound ${measure.bound} and worse than its known finding #${known.issue}, recorded at ${known.recorded}`,
      note: null,
    };
  }
  return {
    problem: null,
    note: `known finding #${known.issue}: ${shown}, bound ${measure.bound}, ceiling ${known.recorded}`,
  };
}
