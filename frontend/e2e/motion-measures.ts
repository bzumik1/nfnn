import type { Page, TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  findingsLeftBehind,
  type MotionKnownFinding,
  type MotionMeasure,
  type MotionPlace,
  REGISTRY,
} from './motion-known-findings';

let registry: readonly MotionKnownFinding[] | undefined;
const measuredInTheTest = new Map<string, MotionMeasure[]>();
const runnerScales = new WeakMap<Page, number>();

export function knownMotionFindings(): readonly MotionKnownFinding[] {
  registry ??= JSON.parse(
    readFileSync(join(__dirname, REGISTRY), 'utf8'),
  ) as readonly MotionKnownFinding[];
  return registry;
}

export function placeOf(testInfo: TestInfo): MotionPlace {
  return {
    project: testInfo.project.name,
    file: relative(join(__dirname, '..'), testInfo.file).split('\\').join('/'),
    title: testInfo.titlePath.slice(1),
  };
}

export function rememberMeasure(testInfo: TestInfo, measure: MotionMeasure): void {
  const measures = measuredInTheTest.get(testInfo.testId) ?? [];
  measures.push(measure);
  measuredInTheTest.set(testInfo.testId, measures);
}

export function rememberRunnerScale(page: Page, factor: number): void {
  runnerScales.set(page, factor);
}

export function motionFindingsLeftBehind(testInfo: TestInfo, page: Page): string[] {
  const measures = measuredInTheTest.get(testInfo.testId) ?? [];
  measuredInTheTest.delete(testInfo.testId);
  return findingsLeftBehind(
    knownMotionFindings(),
    placeOf(testInfo),
    measures,
    runnerScales.get(page),
  );
}
