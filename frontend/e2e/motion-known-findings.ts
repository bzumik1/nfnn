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
  readonly title: readonly string[];
  readonly step?: string;
  readonly metric: MotionMetric;
  readonly recorded: number;
  readonly everyRun: boolean;
  readonly issue: number;
}

export interface MotionPlace {
  readonly project: string;
  readonly file: string;
  readonly title: readonly string[];
}

export interface MotionMeasure extends MotionPlace {
  readonly step?: string;
  readonly metric: MotionMetric;
  readonly value: number;
  readonly bound: number;
  readonly allowance: number;
  readonly timed?: boolean;
  readonly lagMs?: number;
}

export interface MotionVerdict {
  readonly problem: string | null;
  readonly note: string | null;
}

export const REGISTRY = 'motion-known-findings.json';

const sameTitle = (one: readonly string[], other: readonly string[]): boolean =>
  one.length === other.length && one.every((part, index) => part === other[index]);

const placedAt = (finding: MotionKnownFinding, place: MotionPlace): boolean =>
  finding.project === place.project &&
  finding.file === place.file &&
  sameTitle(finding.title, place.title);

const covers = (finding: MotionKnownFinding, measure: MotionMeasure): boolean =>
  placedAt(finding, measure) &&
  finding.metric === measure.metric &&
  (finding.step ?? null) === (measure.step ?? null);

const shownOf = (measure: MotionMeasure): string =>
  `${measure.metric} ${measure.value}${measure.step === undefined ? '' : ` at ${measure.step}`}`;

export function judgedAgainstTheKnownFindings(
  findings: readonly MotionKnownFinding[],
  measure: MotionMeasure,
): MotionVerdict {
  const shown = shownOf(measure);
  const known = findings.find((finding) => covers(finding, measure));
  if (measure.value <= measure.bound) {
    return known === undefined
      ? { problem: null, note: null }
      : {
          problem: null,
          note: `the known finding #${known.issue} did not breach in this measure: ${shown}, bound ${measure.bound}`,
        };
  }
  if (known === undefined) {
    return { problem: `${shown} is past its bound ${measure.bound}`, note: null };
  }
  if (measure.value > known.recorded + measure.allowance) {
    return {
      problem: `${shown} is past its bound ${measure.bound} and worse than its known finding #${known.issue}, recorded at ${known.recorded}, by more than ${measure.allowance}`,
      note: null,
    };
  }
  return {
    problem: null,
    note: `known finding #${known.issue}: ${shown}, bound ${measure.bound}, ceiling ${known.recorded}`,
  };
}

export function timedBudgetOf(
  findings: readonly MotionKnownFinding[],
  measure: MotionMeasure,
): { readonly budget: number; readonly what: string } {
  const known = findings.find((finding) => covers(finding, measure));
  return known === undefined
    ? { budget: measure.bound, what: `${shownOf(measure)} against its binding bound` }
    : {
        budget: Math.round((known.recorded + measure.allowance) * 1000) / 1000,
        what: `${shownOf(measure)} against its known finding #${known.issue}, ceiling ${known.recorded} plus ${measure.allowance}`,
      };
}

const withinTheBound = (measure: MotionMeasure, scale: number | undefined): boolean | null => {
  if (!measure.timed) {
    return measure.value <= measure.bound;
  }
  return scale === undefined ? null : measure.value <= measure.bound * scale + (measure.lagMs ?? 0);
};

export function findingsLeftBehind(
  findings: readonly MotionKnownFinding[],
  place: MotionPlace,
  measures: readonly MotionMeasure[],
  scale?: number,
): string[] {
  return findings
    .filter((finding) => finding.everyRun && placedAt(finding, place))
    .flatMap((finding) => {
      const ofIt = measures.filter((measure) => covers(finding, measure));
      const within = ofIt.map((measure) => withinTheBound(measure, scale));
      return ofIt.length > 0 && within.every((each) => each === true)
        ? [
            `${ofIt.map(shownOf).join(', ')} within the bound ${ofIt[0].bound}: the known finding #${finding.issue} no longer breaches, so remove its entry from ${REGISTRY}`,
          ]
        : [];
    });
}
