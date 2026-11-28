import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { launchOptionsOf, ONE_GARBAGE_COLLECTOR_THREAD } from '../e2e/launch-options.ts';

describe('Given the browsers back-matrix.spec.ts launches in each Playwright project', () => {
  it('when the chromium project launches its Chromium, then V8 collects garbage on one thread', () => {
    assert.deepEqual(launchOptionsOf('chromium', 'chromium'), {
      args: [ONE_GARBAGE_COLLECTOR_THREAD],
    });
  });

  it('when the motion-timed project launches its Chromium, then the browser keeps its own garbage collector threads', () => {
    assert.deepEqual(launchOptionsOf('chromium', 'motion-timed'), {});
  });

  it('when the WebKit projects launch, then they get no Chromium flag', () => {
    assert.deepEqual(launchOptionsOf('webkit', 'iphone'), {});
    assert.deepEqual(launchOptionsOf('webkit', 'iphone-sprava'), {});
  });
});
