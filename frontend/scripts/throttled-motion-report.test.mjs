import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { throttledMotionReport } from './throttled-motion-report.mjs';

const failure = (message) => ({ status: 'failed', errors: [{ message }] });
const pass = { status: 'passed', errors: [] };

const report = {
  suites: [
    {
      title: 'back-matrix.spec.ts',
      specs: [],
      suites: [
        {
          title: 'Given an administrator in the app',
          suites: [],
          specs: [
            {
              title: 'when ‹ is pressed on every screen',
              tests: [
                {
                  projectName: 'chromium',
                  results: [
                    failure(
                      'Long Animation Frames between the tap and the placing: at 3 ms for 180 ms (scripts by source: http://localhost:4300/chunk-ABC123.js 120 ms (forced style and layout 4 ms), https://probe.invalid/nfnn-probe.js 20 ms (forced style and layout 0 ms); style and layout 30 ms; blocking 90 ms)',
                    ),
                  ],
                },
                { projectName: 'chromium', results: [pass] },
                {
                  projectName: 'chromium',
                  results: [
                    failure(
                      'at 9 ms for 60 ms (scripts by source: http://localhost:4300/main-XYZ.js 50 ms (forced style and layout 1 ms); style and layout 2 ms; blocking 10 ms)',
                    ),
                  ],
                },
              ],
            },
            {
              title: 'when a finger takes it back',
              tests: [{ projectName: 'chromium', results: [pass] }],
            },
          ],
        },
      ],
    },
  ],
};

describe('Given the Playwright report of the back matrix at a slow CPU', () => {
  it('when it is summarised, then every row shows how often it failed and which app scripts its failures named, without the probe', () => {
    const lines = throttledMotionReport(report, '#1982');

    assert.ok(lines[0].includes('#1982'));
    assert.ok(
      lines.includes(
        '| Given an administrator in the app › when ‹ is pressed on every screen | 2/3 | /chunk-ABC123.js, /main-XYZ.js |',
      ),
    );
    assert.ok(
      lines.includes(
        '| Given an administrator in the app › when a finger takes it back | 0/1 | – |',
      ),
    );
    assert.ok(lines.some((line) => line.includes('1 of 2 rows failed')));
    assert.ok(!lines.some((line) => line.includes('nfnn-probe.js')));
  });
});
