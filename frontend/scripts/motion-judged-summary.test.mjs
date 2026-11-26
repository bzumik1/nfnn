import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgedOnTheScreen, stampLagAboveTheReviewed } from './motion-judged-summary.mjs';

const row = (file, project, status, notJudged = []) => ({
  title: `a row of ${file}`,
  file,
  tests: [
    {
      projectName: project,
      results: [{ status }],
      annotations: notJudged.map((description) => ({ type: 'nfnn-not-judged', description })),
    },
  ],
});

const report = (specs) => ({ suites: [{ title: 'root', specs, suites: [] }] });

describe('Given the merged report of the end-to-end shards', () => {
  it('when back-matrix rows judged frames on the screen, were not judged on this runner, ran in WebKit or judged no frame at all, then the summary counts as judged on the screen only the rows that judged screencast frames, and names the steps not judged', () => {
    const judged = row('back-matrix.spec.ts', 'chromium', 'passed');
    judged.tests[0].annotations.push({ type: 'nfnn-stamp-lag', description: '1.00 2.00' });
    const failed = row('back-matrix.spec.ts', 'chromium', 'failed');
    failed.tests[0].annotations.push({ type: 'nfnn-stamp-lag', description: '1.00' });
    const summary = judgedOnTheScreen(
      report([
        judged,
        failed,
        row('back-matrix.spec.ts', 'chromium', 'passed'),
        row('sprava-back-matrix.spec.ts', 'chromium', 'skipped', [
          'the leaving page: the screencast drew no frame for 400 ms of a 350 ms motion',
        ]),
        row('back-matrix.spec.ts', 'iphone', 'passed'),
        row('top-area.spec.ts', 'chromium', 'passed'),
      ]),
    );

    assert.match(summary, /\| chromium \| 2 \| 1 \|/);
    assert.doesNotMatch(summary, /\| iphone \|/);
    assert.match(summary, /the screencast drew no frame for 400 ms/);
    assert.doesNotMatch(summary, /top-area/);
  });

  it('when the rows logged the screencast stamp lag of their frames, then the summary gives its p99 in steady frames over every frame', () => {
    const lagged = row('back-matrix.spec.ts', 'chromium', 'passed');
    lagged.tests[0].annotations.push(
      { type: 'nfnn-stamp-lag', description: Array.from({ length: 98 }, () => '1.00').join(' ') },
      { type: 'nfnn-stamp-lag', description: '2.50 2.50' },
    );

    assert.match(
      judgedOnTheScreen(report([lagged])),
      /screencast stamp lag on this runner: p99 2\.50 steady frames over 100 frames/,
    );
  });

  it('when the step frames of the run give a p99 stamp lag above the reviewed CI value, then the check names the new value to raise it to in a reviewed commit', () => {
    const lagged = row('back-matrix.spec.ts', 'chromium', 'passed');
    lagged.tests[0].annotations.push(
      { type: 'nfnn-stamp-lag', description: Array.from({ length: 98 }, () => '1.00').join(' ') },
      { type: 'nfnn-stamp-lag', description: '3.20 3.20' },
    );

    assert.match(
      stampLagAboveTheReviewed(report([lagged]), 2.99),
      /p99 stamp lag of this run's step frames, 3\.20, is above the reviewed 2\.99 .*raise it to 3\.20 in a reviewed commit/,
    );
  });

  it('when the step frames of the run stay at or below the reviewed CI value, then the check passes', () => {
    const lagged = row('back-matrix.spec.ts', 'chromium', 'passed');
    lagged.tests[0].annotations.push({ type: 'nfnn-stamp-lag', description: '2.99 1.00 2.00' });

    assert.equal(stampLagAboveTheReviewed(report([lagged]), 2.99), null);
  });

  it('when no step frame of the run had its stamp lag measured, then the check fails, since the reviewed value went unchecked', () => {
    assert.match(
      stampLagAboveTheReviewed(report([row('back-matrix.spec.ts', 'chromium', 'passed')]), 2.99),
      /no step frame of this run had its stamp lag measured/i,
    );
    assert.match(stampLagAboveTheReviewed(report([]), 2.99), /no step frame of this run/i);
  });

  it('when no back-matrix row ran, then the summary says so', () => {
    assert.match(judgedOnTheScreen(report([])), /no row of the back matrix ran/);
  });
});
