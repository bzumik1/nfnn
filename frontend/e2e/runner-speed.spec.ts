import { expect, test, testWithoutBrowser } from './fixtures';
import {
  type BudgetCheck,
  medianAfterWarmUp,
  runnerSpeed,
  type SpeedReference,
  speedProblems,
} from './runner-speed';

const REFERENCE: SpeedReference = {
  browser: 'chromium',
  version: '1.0',
  medianMs: 20,
  recordedOn: 'the Prodesk',
};

function placedAfter(ms: number): BudgetCheck {
  return {
    what: 'ms from the tap until both copies were placed',
    measured: ms,
    budget: 150,
    slack: 0,
    unit: 'ms',
  };
}

testWithoutBrowser.describe('Given the runs of the in-page benchmark', () => {
  testWithoutBrowser(
    'when the first two runs are slow while the page warms up, then the median leaves them out and takes the middle of the rest',
    () => {
      expect(medianAfterWarmUp([49, 46, 29, 27, 26, 28, 27])).toBe(27);
    },
  );

  testWithoutBrowser(
    'when a later run is slow, then it counts like any other run after the warm-up',
    () => {
      expect(medianAfterWarmUp([49, 46, 27, 60, 61, 26, 28])).toBe(28);
    },
  );
});

testWithoutBrowser.describe(
  'Given the budgets of a step judged against the speed of the runner',
  () => {
    testWithoutBrowser(
      'when the runner is slower than 1.5× the reference before or after the rows, then the row fails naming the factor',
      () => {
        const problems = speedProblems({
          medians: [24, 44],
          reference: REFERENCE,
          version: '1.0',
          checks: [placedAfter(100)],
        });

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('2.20× slower than the reference');
      },
    );

    testWithoutBrowser(
      'when the runner is faster than the reference, then the budget stays at 150 ms and a step placed after 160 ms fails naming the factor and the budget',
      () => {
        const problems = speedProblems({
          medians: [10, 12],
          reference: REFERENCE,
          version: '1.0',
          checks: [placedAfter(150), placedAfter(160)],
        });

        expect(problems).toEqual([expect.stringContaining('160 ms against 150 ms')]);
        expect(problems[0]).toContain('×1.00');
      },
    );

    testWithoutBrowser(
      'when the runner is 1.3× slower than the reference, then the budget grows to 195 ms and no further',
      () => {
        const problems = speedProblems({
          medians: [26, 22],
          reference: REFERENCE,
          version: '1.0',
          checks: [placedAfter(195), placedAfter(200)],
        });

        expect(problems).toEqual([expect.stringContaining('200 ms against 195 ms')]);
        expect(problems[0]).toContain('×1.30');
      },
    );

    testWithoutBrowser(
      'when the browser is not the one the reference was recorded with, then the row fails asking for the reference again',
      () => {
        const problems = speedProblems({
          medians: [20, 20],
          reference: REFERENCE,
          version: '2.0',
          checks: [placedAfter(100)],
        });

        expect(problems).toEqual([expect.stringContaining('record it again on the Prodesk')]);
      },
    );
  },
);

test.describe('Given the in-page benchmark of the runner’s speed', () => {
  test('when Chromium runs four times slower, then the benchmark reports a runner beyond 1.5× and the row fails naming the factor', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'only Chromium can slow its own CPU down; the benchmark itself runs in every engine',
    );
    await page.goto('/');
    const steady = await runnerSpeed(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const slowed = await runnerSpeed(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();

    const problems = speedProblems({
      medians: [steady.medianMs, slowed.medianMs],
      reference: {
        browser: steady.browser,
        version: steady.version,
        medianMs: steady.medianMs,
        recordedOn: 'this runner',
      },
      version: slowed.version,
      checks: [placedAfter(100)],
    });
    expect(problems).toEqual([expect.stringMatching(/the runner is \d\.\d\d× slower/)]);
  });
});
