import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MOTION_METRICS as GUARDED_METRICS } from '../../scripts/motion-known-findings.mjs';
import {
  findingsLeftBehind,
  judgedAgainstTheKnownFindings,
  MOTION_METRICS,
} from '../e2e/motion-known-findings.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

const where = {
  project: 'iphone',
  file: 'e2e/back-motion-start.spec.ts',
  test: 'when Zpět is pressed, then the first frame comes early',
  metric: 'first-frame-share',
  bound: 0.174,
  allowance: 0.194,
};

const finding = (overrides = {}) => ({
  project: where.project,
  file: where.file,
  test: where.test,
  metric: where.metric,
  recorded: 0.58,
  everyRun: true,
  issue: 2200,
  ...overrides,
});

describe('Given a motion measured against its binding bound with no known finding', () => {
  it('when the value is within the bound, then nothing is reported', () => {
    assert.deepEqual(judgedAgainstTheKnownFindings([], { ...where, value: 0.12 }), {
      problem: null,
      note: null,
    });
  });

  it('when the value is past the bound, then it fails naming the metric, the value and the bound', () => {
    const verdict = judgedAgainstTheKnownFindings([], { ...where, value: 0.2 });

    assert.match(verdict.problem, /first-frame-share 0\.2 is past its bound 0\.174/);
  });
});

describe('Given a known finding of the measured motion', () => {
  it('when the value is past the bound but within the recorded ceiling, then it passes with a note naming the issue', () => {
    const verdict = judgedAgainstTheKnownFindings([finding()], { ...where, value: 0.58 });

    assert.equal(verdict.problem, null);
    assert.match(verdict.note, /#2200/);
  });

  it('when the value is past the ceiling by less than a user sees, then it passes as the known finding', () => {
    const verdict = judgedAgainstTheKnownFindings([finding()], { ...where, value: 0.77 });

    assert.equal(verdict.problem, null);
    assert.match(verdict.note, /#2200/);
  });

  it('when the value is past the ceiling by more than a user sees, then it fails as worse than the known finding', () => {
    const verdict = judgedAgainstTheKnownFindings([finding()], { ...where, value: 0.8 });

    assert.match(
      verdict.problem,
      /worse than its known finding #2200, recorded at 0\.58, by more than 0\.194/,
    );
  });

  it('when a known finding is within the bound in one measure, then that measure passes with a note', () => {
    const verdict = judgedAgainstTheKnownFindings([finding()], { ...where, value: 0.1 });

    assert.equal(verdict.problem, null);
    assert.match(verdict.note, /#2200 did not breach in this measure/);
  });

  it('when the finding names another project, test, metric or step, then it does not cover the motion', () => {
    for (const other of [
      { project: 'chromium' },
      { test: 'another test' },
      { metric: 'held-ms' },
      { step: '/sprava' },
    ]) {
      const verdict = judgedAgainstTheKnownFindings([finding(other)], { ...where, value: 0.3 });

      assert.match(verdict.problem, /past its bound/, JSON.stringify(other));
    }
  });

  it('when the finding names the step of a walk, then it covers only that step', () => {
    const atStep = finding({ step: '/sprava/darci' });

    assert.equal(
      judgedAgainstTheKnownFindings([atStep], { ...where, step: '/sprava/darci', value: 0.3 })
        .problem,
      null,
    );
    assert.match(
      judgedAgainstTheKnownFindings([atStep], { ...where, step: '/sprava', value: 0.3 }).problem,
      /past its bound/,
    );
  });
});

describe('Given the measures one test took of its known findings', () => {
  const place = { project: where.project, file: where.file, test: where.test };
  const measured = (value, overrides = {}) => ({ ...where, value, ...overrides });

  it('when a finding seen in every run on main breached in none of them, then it is left behind until its entry goes', () => {
    assert.match(
      findingsLeftBehind([finding()], place, [measured(0.1), measured(0.12)]).join('\n'),
      /#2200 no longer breaches.*remove its entry from motion-known-findings\.json/,
    );
  });

  it('when one of its measures still breached, then nothing is left behind', () => {
    assert.deepEqual(findingsLeftBehind([finding()], place, [measured(0.1), measured(0.3)]), []);
  });

  it('when a finding seen only in some runs on main breached in none, then nothing is left behind', () => {
    assert.deepEqual(
      findingsLeftBehind([finding({ everyRun: false })], place, [measured(0.1)]),
      [],
    );
  });

  it('when the test took no measure of the finding, then nothing is judged', () => {
    assert.deepEqual(findingsLeftBehind([finding()], place, []), []);
    assert.deepEqual(
      findingsLeftBehind([finding()], { ...place, test: 'another test' }, [measured(0.1)]),
      [],
    );
  });
});

describe('Given the metrics the helper and the guard know', () => {
  it('when both lists are read, then they are the same', () => {
    assert.deepEqual([...MOTION_METRICS], [...GUARDED_METRICS]);
  });

  it('when the registry is read, then every entry names a metric of the list', () => {
    const entries = JSON.parse(
      readFileSync(join(HERE, '../e2e/motion-known-findings.json'), 'utf8'),
    );

    assert.deepEqual(
      entries.filter((entry) => !MOTION_METRICS.includes(entry.metric)),
      [],
    );
  });
});
