import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { untilQuiet } from '../e2e/settled.ts';

function pageOf(frames) {
  let time = 0;
  let frame = 0;
  let pending = frames[0].inFlight;
  return {
    now: () => time,
    inFlight: () => pending,
    nextFrames: async () => {
      const next = frames[Math.min(frame, frames.length - 1)];
      frame += 1;
      time += next.ms;
      pending = next.inFlight;
    },
    frames: () => frame,
  };
}

describe('Given a page watched until no request is in flight for two rounds of frames', () => {
  it('when one round of frames outlasts the whole timeout with nothing in flight, then the page counts as settled', async () => {
    const page = pageOf([
      { ms: 10_200, inFlight: 0 },
      { ms: 16, inFlight: 0 },
    ]);

    await untilQuiet({ ...page, timeoutMs: 10_000 });

    assert.equal(page.frames(), 2);
  });

  it('when a request stays in flight past the timeout, then it fails and names how many still wait', async () => {
    const page = pageOf([{ ms: 1_000, inFlight: 2 }]);

    await assert.rejects(untilQuiet({ ...page, timeoutMs: 10_000 }), {
      message: 'the page still waits for 2 requests',
    });
    assert.ok(page.now() > 10_000);
  });

  it('when requests finish before the timeout, then it waits for two quiet rounds after the last one', async () => {
    const page = pageOf([
      { ms: 16, inFlight: 1 },
      { ms: 16, inFlight: 0 },
      { ms: 16, inFlight: 1 },
      { ms: 16, inFlight: 0 },
      { ms: 16, inFlight: 0 },
    ]);

    await untilQuiet({ ...page, timeoutMs: 10_000 });

    assert.equal(page.frames(), 5);
  });
});
