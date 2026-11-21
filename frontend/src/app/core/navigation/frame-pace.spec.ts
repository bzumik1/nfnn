import {
  LATE_FRAME_PAST_THE_STEADY_ONE,
  RETIMED_AT_MOST_MS,
  RETIMED_WITHIN_MS,
  STEADY_FRAME_LONGEST_MS,
  STEADY_FRAME_SHORTEST_MS,
  retimingOf,
  steadyFrameMs,
} from './frame-pace';

describe('Given the gaps between the frames a device drew before the tap', () => {
  it('when they keep one pace with a long one among them, then the steady frame is their median, not their mean', () => {
    expect(steadyFrameMs([16, 17, 16, 90, 17, 16, 16])).toBe(16);
  });

  it('when their count is even, then the steady frame lies half way between the two middle gaps', () => {
    expect(steadyFrameMs([8.4, 8.2, 8.3, 8.1])).toBeCloseTo(8.25);
  });

  it('when the device draws at 30 frames a second, then the steady frame is its 33 ms', () => {
    expect(steadyFrameMs([33, 34, 33, 33])).toBe(33);
  });

  it('when they are shorter than any screen draws, then the steady frame is the shortest it may be', () => {
    expect(steadyFrameMs([2, 3, 2])).toBe(STEADY_FRAME_SHORTEST_MS);
  });

  it('when they are longer than a slow device draws, then the steady frame is the longest it may be', () => {
    expect(steadyFrameMs([120, 140, 90])).toBe(STEADY_FRAME_LONGEST_MS);
  });

  it('when no frame was seen at all, then the steady frame is the longest it may be, so a step is never slowed by a guess', () => {
    expect(steadyFrameMs([])).toBe(STEADY_FRAME_LONGEST_MS);
  });
});

describe('Given a step whose motion has begun', () => {
  const steady = 16;

  it('when a frame comes at the steady pace, then its start stays', () => {
    expect(retimingOf({ gapMs: 17, steadyMs: steady, shownMs: 16, shiftedMs: 0 })).toBe(0);
  });

  it('when a frame comes up to 1.5 steady frames late, then its start stays', () => {
    expect(
      retimingOf({
        gapMs: steady * LATE_FRAME_PAST_THE_STEADY_ONE,
        steadyMs: steady,
        shownMs: 16,
        shiftedMs: 0,
      }),
    ).toBe(0);
  });

  it('when a frame comes long, then the start moves by all of it past one steady frame, so the frame shows one steady frame of travel', () => {
    expect(retimingOf({ gapMs: 80, steadyMs: steady, shownMs: 16, shiftedMs: 0 })).toBe(64);
  });

  it('when the frame before it had shown half of the motion already, then the start stays', () => {
    expect(
      retimingOf({ gapMs: 80, steadyMs: steady, shownMs: RETIMED_WITHIN_MS, shiftedMs: 0 }),
    ).toBe(0);
  });

  it('when the step has been moved later almost as far as it may, then the start moves only by what is left', () => {
    expect(
      retimingOf({
        gapMs: 80,
        steadyMs: steady,
        shownMs: 16,
        shiftedMs: RETIMED_AT_MOST_MS - 10,
      }),
    ).toBe(10);
  });

  it('when the step has been moved later as far as it may, then the start stays', () => {
    expect(
      retimingOf({ gapMs: 80, steadyMs: steady, shownMs: 16, shiftedMs: RETIMED_AT_MOST_MS }),
    ).toBe(0);
  });
});
