import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from './fixtures';
import {
  judgedAgainstTheKnownFindings,
  type MotionKnownFinding,
  type MotionMeasure,
  REGISTRY,
} from './motion-known-findings';

export const MOTION_MEASURE_ANNOTATION = 'nfnn-motion-measure';
export const KNOWN_MOTION_FINDING_ANNOTATION = 'known motion finding';

let registry: readonly MotionKnownFinding[] | undefined;

function knownMotionFindings(): readonly MotionKnownFinding[] {
  registry ??= JSON.parse(
    readFileSync(join(__dirname, REGISTRY), 'utf8'),
  ) as readonly MotionKnownFinding[];
  return registry;
}

export function expectWithinTheBound(
  measure: Pick<MotionMeasure, 'metric' | 'value' | 'bound' | 'step'>,
): void {
  const testInfo = test.info();
  const measured: MotionMeasure = {
    ...measure,
    project: testInfo.project.name,
    file: relative(join(__dirname, '..'), testInfo.file).split('\\').join('/'),
    test: testInfo.title,
  };
  testInfo.annotations.push({
    type: MOTION_MEASURE_ANNOTATION,
    description: JSON.stringify(measured),
  });
  const verdict = judgedAgainstTheKnownFindings(knownMotionFindings(), measured);
  if (verdict.note !== null) {
    testInfo.annotations.push({ type: KNOWN_MOTION_FINDING_ANNOTATION, description: verdict.note });
  }
  expect.soft(verdict.problem, verdict.problem ?? undefined).toBeNull();
}
