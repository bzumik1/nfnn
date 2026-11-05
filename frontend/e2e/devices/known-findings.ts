import type { Check } from './layout-checks';

export interface KnownFinding {
  poses: string[];
  steps: string[];
  check: string;
  shows: string;
  reason: string;
}

export interface KnownBreak {
  poses: string[];
  steps: string[];
  reason: string;
}

export const KNOWN_FINDINGS: KnownFinding[] = [];

export const KNOWN_BREAKS: KnownBreak[] = [];

export const knownFindings = (pose: string, step: string): KnownFinding[] =>
  KNOWN_FINDINGS.filter((known) => known.poses.includes(pose) && known.steps.includes(step));

export const knownBreak = (pose: string, step: string): KnownBreak | undefined =>
  KNOWN_BREAKS.find((known) => known.poses.includes(pose) && known.steps.includes(step));

export const matches = (known: KnownFinding, check: Check): boolean =>
  !check.pass && check.name === known.check && check.detail.includes(known.shows);
