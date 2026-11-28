import type { Page } from '@playwright/test';
import { rememberRunnerScale } from './motion-measures';
import { evaluateAsProbe } from './top-area';

export interface SpeedReference {
  readonly browser: string;
  readonly version: string;
  readonly medianMs: number;
  readonly recordedOn: string;
}

export interface BudgetCheck {
  readonly what: string;
  readonly measured: number;
  readonly budget: number;
  readonly slack: number;
  readonly unit: string;
}

export interface RunnerSpeed {
  readonly browser: string;
  readonly version: string;
  readonly medianMs: number;
}

export interface SpeedVerdict {
  readonly medians: readonly number[];
  readonly reference: SpeedReference | null;
  readonly version: string;
  readonly checks: readonly BudgetCheck[];
  readonly unscaled?: string;
}

interface SpeedGate {
  readonly before: RunnerSpeed;
  readonly checks: BudgetCheck[];
}

type MotionGate = { readonly timed: false } | ({ readonly timed: true } & SpeedGate);

export const TIMED_MOTION_TAG = '@timed-motion';
export const BENCHMARK_WARM_UP_RUNS = 2;
export const BENCHMARK_RUNS = 5;
export const FASTEST_SCALE = 1;
export const SLOWEST_SCALE = 1.5;

export const CHROMIUM_SPEED_REFERENCE: SpeedReference = {
  browser: 'chromium',
  version: '156.0.8078.4',
  medianMs: 27.7,
  recordedOn: 'the Prodesk',
};

export const WEBKIT_SPEED_REFERENCE: SpeedReference = {
  browser: 'webkit',
  version: '27.2',
  medianMs: 24.5,
  recordedOn: 'the Prodesk',
};

export const SAFARI_SPEED_REFERENCE: SpeedReference | null = null;

export const KNOWN_SLOW_CPU_DEFECT = '#1982';
const CPU_SLOWDOWN = Number(process.env['NFNN_CPU_SLOWDOWN'] ?? 1);
const UNSCALED_AT_SLOW_CPU = `budgets unscaled at a ${CPU_SLOWDOWN}× slower CPU, the nightly run of the known defect ${KNOWN_SLOW_CPU_DEFECT}`;

const gates = new WeakMap<Page, MotionGate>();

export function slowedForTheKnownDefect(): boolean {
  return CPU_SLOWDOWN > 1;
}

function referenceFor(browser: string): SpeedReference | null {
  if (process.env['SAFARI']) {
    return SAFARI_SPEED_REFERENCE;
  }
  return browser === 'chromium'
    ? CHROMIUM_SPEED_REFERENCE
    : browser === 'webkit'
      ? WEBKIT_SPEED_REFERENCE
      : null;
}

export async function runnerSpeed(page: Page): Promise<RunnerSpeed> {
  const browser = page.context().browser();
  const runs = await evaluateAsProbe(
    page,
    (count) => {
      const once = (): number => {
        const from = performance.now();
        const numbers: number[] = [];
        for (let at = 0; at < 200_000; at++) {
          numbers.push((at * 2_654_435_761) % 1_000_003);
        }
        numbers.sort((one, other) => one - other);
        const counts: Record<string, number> = {};
        for (let at = 0; at < 100_000; at++) {
          const key = `k${at % 997}`;
          counts[key] = (counts[key] ?? 0) + at;
        }
        let text = '';
        for (let at = 0; at < 50_000; at++) {
          text += String.fromCharCode(97 + (at % 26));
        }
        const kept = numbers[1000] + text.length + Object.keys(counts).length;
        return kept < 0 ? -1 : performance.now() - from;
      };
      return Array.from({ length: count }, once);
    },
    BENCHMARK_WARM_UP_RUNS + BENCHMARK_RUNS,
  );
  return {
    browser: browser?.browserType().name() ?? 'unknown',
    version: browser?.version() ?? 'unknown',
    medianMs: medianAfterWarmUp(runs),
  };
}

export function medianAfterWarmUp(runs: readonly number[]): number {
  const counted = runs.slice(BENCHMARK_WARM_UP_RUNS).sort((one, other) => one - other);
  return counted[Math.floor(counted.length / 2)];
}

export async function startMotionGate(page: Page, tags: readonly string[]): Promise<void> {
  if (CPU_SLOWDOWN > 1 && page.context().browser()?.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  }
  gates.set(
    page,
    tags.includes(TIMED_MOTION_TAG)
      ? { timed: true, before: await runnerSpeed(page), checks: [] }
      : { timed: false },
  );
}

export function judgedAgainstTheRunner(page: Page): BudgetCheck[] | null {
  const gate = gates.get(page);
  if (gate === undefined) {
    throw new Error(
      'the motion gate was not started before the rows: call startMotionGate(page, testInfo.tags) in beforeEach',
    );
  }
  return gate.timed ? gate.checks : null;
}

export function judgesTime(page: Page): boolean {
  return gates.get(page)?.timed === true;
}

export async function runnerSpeedProblems(page: Page): Promise<string[]> {
  const gate = gates.get(page);
  gates.delete(page);
  if (gate === undefined || !gate.timed || gate.checks.length === 0) {
    return [];
  }
  const after = await runnerSpeed(page);
  const verdict: SpeedVerdict = {
    medians: [gate.before.medianMs, after.medianMs],
    reference: referenceFor(after.browser),
    version: after.version,
    checks: gate.checks,
    unscaled: CPU_SLOWDOWN > 1 ? UNSCALED_AT_SLOW_CPU : undefined,
  };
  const factor = scaleOf(verdict);
  if (factor !== null) {
    rememberRunnerScale(page, factor);
  }
  return speedProblems(verdict);
}

export function scaleOf({ medians, reference, version, unscaled }: SpeedVerdict): number | null {
  if (reference === null || unscaled !== undefined) {
    return FASTEST_SCALE;
  }
  const raw = Math.max(...medians) / reference.medianMs;
  return reference.version !== version || raw > SLOWEST_SCALE ? null : Math.max(FASTEST_SCALE, raw);
}

function rounded(value: number, unit: string): string {
  return unit === 'ms' ? `${value.toFixed(0)} ms` : `${(value * 100).toFixed(1)} %`;
}

export function speedProblems({
  medians,
  reference,
  version,
  checks,
  unscaled,
}: SpeedVerdict): string[] {
  const worst = Math.max(...medians);
  const measured = `the runner’s benchmark median ${worst.toFixed(1)} ms (the worse of ${medians.map((median) => median.toFixed(1)).join(' and ')} ms, before and after the rows)`;
  let factor = FASTEST_SCALE;
  let against =
    unscaled === undefined
      ? 'no reference is recorded for this browser yet, so the budget is not scaled'
      : `${unscaled}; ${measured}`;
  if (reference !== null && unscaled === undefined) {
    if (reference.version !== version) {
      return [
        `the runner’s speed reference was recorded with ${reference.browser} ${reference.version} on ${reference.recordedOn}, but this runner has ${version}: record it again on ${reference.recordedOn} in the PR that upgrades the browser`,
      ];
    }
    const raw = worst / reference.medianMs;
    if (raw > SLOWEST_SCALE) {
      return [
        `the runner is ${raw.toFixed(2)}× slower than the reference (${measured} against ${reference.medianMs.toFixed(1)} ms on ${reference.recordedOn}, ${reference.browser} ${reference.version}), beyond the ${SLOWEST_SCALE}× the budgets may be scaled by, so the row cannot be judged and fails`,
      ];
    }
    factor = Math.max(FASTEST_SCALE, raw);
    against = `${measured} against ${reference.medianMs.toFixed(1)} ms on ${reference.recordedOn}, ${reference.browser} ${reference.version}`;
  }
  return checks.flatMap((check) => {
    const limit = check.budget * factor + check.slack;
    return check.measured <= limit
      ? []
      : [
          `${check.what}: ${rounded(check.measured, check.unit)} against ${rounded(limit, check.unit)}, the budget ${rounded(check.budget, check.unit)} scaled by the runner’s speed ×${factor.toFixed(2)} (${against})`,
        ];
  });
}
