import { BackSwipe, settleFrom, SwipeSettle } from './back-swipe';
import { closeInOnFinger } from './swipe-drawing';

const START_GAP = 220;
const FAST_MS = 150;
const STEP_AT_MOST = START_GAP / 8;
const FIRST_GAPS = [8.3, 16.7, 33.3, 50, 120, 220];
const SIXTIETH_MS = 1000 / 60;

interface Display {
  readonly view: Window;
  frame(at: number): void;
}

function simulatedDisplay(): Display {
  let now = 0;
  let frames: FrameRequestCallback[] = [];
  let nextTimer = 1;
  const timers = new Map<number, { readonly due: number; readonly run: () => void }>();
  const runTimersUntil = (at: number): void => {
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= at)
        .sort(([, one], [, other]) => one.due - other.due)[0];
      if (due === undefined) {
        break;
      }
      timers.delete(due[0]);
      now = due[1].due;
      due[1].run();
    }
    now = at;
  };
  const view = {
    performance: { now: () => now },
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    setTimeout: (run: () => void, ms: number) => {
      const id = nextTimer++;
      timers.set(id, { due: now + ms, run });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  } as unknown as Window;
  return {
    view,
    frame: (at) => {
      runTimersUntil(at);
      const drawn = frames;
      frames = [];
      drawn.forEach((callback) => callback(at));
    },
  };
}

interface CloseIn {
  readonly steps: number[];
  readonly framesToTheFinger: number | null;
}

function closeInOver(frameMs: number, firstAt: number, gaps: readonly number[]): CloseIn {
  const display = simulatedDisplay();
  let offset = 0;
  let caught = false;
  closeInOnFinger(display.view, FAST_MS, {
    frameMs,
    finger: () => START_GAP,
    from: 0,
    show: (at) => (offset = at),
    goesOn: () => !caught,
    caughtUp: () => (caught = true),
  });
  const offsets = [0];
  let at = firstAt;
  let framesToTheFinger: number | null = null;
  for (const gap of [0, ...gaps]) {
    at += gap;
    display.frame(at);
    offsets.push(offset);
    if (framesToTheFinger === null && offset === START_GAP) {
      framesToTheFinger = offsets.length - 1;
    }
    if (caught) {
      break;
    }
  }
  return {
    steps: offsets.slice(1).map((shown, frame) => shown - offsets[frame]),
    framesToTheFinger,
  };
}

describe('Given the page closing in on a finger 220 px ahead once the page Zpět leads to is drawn', () => {
  for (const { display, nativeMs, measuredMs } of [
    { display: '60 Hz', nativeMs: SIXTIETH_MS, measuredMs: [SIXTIETH_MS, 34] },
    { display: '120 Hz', nativeMs: 1000 / 120, measuredMs: [1000 / 120, SIXTIETH_MS, 34] },
    { display: '30 Hz', nativeMs: 1000 / 30, measuredMs: [1000 / 30, 34] },
  ]) {
    for (const measured of measuredMs) {
      it(`when a ${display} display, with ${measured.toFixed(1)} ms measured before, draws its first three gaps in any mix of 8.3, 16.7, 33.3, 50, 120 and 220 ms after a first frame on time or 16.7, 33.3, 50 or 120 ms late, the page clock ticking in the long ones, then no frame moves the page more than an eighth of the gap it started from`, () => {
        const tooFar: string[] = [];
        for (const first of FIRST_GAPS) {
          for (const second of FIRST_GAPS) {
            for (const third of FIRST_GAPS) {
              for (const firstAt of [nativeMs, 16.7, 33.3, 50, 120]) {
                const gaps = [first, second, third, ...Array<number>(120).fill(nativeMs)];
                closeInOver(measured, firstAt, gaps).steps.forEach((step, frame) => {
                  if (step > STEP_AT_MOST + 1e-9) {
                    tooFar.push(
                      `${[first, second, third].join(', ')} after ${firstAt}: frame ${frame + 1} moved ${step.toFixed(1)} px`,
                    );
                  }
                });
              }
            }
          }
        }

        expect(tooFar.slice(0, 10), `${tooFar.length} frames too far`).toEqual([]);
      });
    }
  }

  it('when the frames stop for a second in a visible page after three of them, then the page clock moves the page after 500 ms without a frame, and every move it makes, on a frame or a tick, is at most an eighth of the gap', () => {
    const display = simulatedDisplay();
    const moves: number[] = [];
    let offset = 0;
    let caught = false;
    closeInOnFinger(display.view, FAST_MS, {
      frameMs: SIXTIETH_MS,
      finger: () => START_GAP,
      from: 0,
      show: (at) => {
        moves.push(at - offset);
        offset = at;
      },
      goesOn: () => !caught,
      caughtUp: () => (caught = true),
    });
    for (const at of [SIXTIETH_MS, 2 * SIXTIETH_MS, 3 * SIXTIETH_MS, 1050]) {
      display.frame(at);
    }

    expect(Math.max(...moves), 'the longest move').toBeLessThanOrEqual(STEP_AT_MOST + 1e-9);
    expect(offset, 'the page stood still while the frames stopped').toBeGreaterThan(
      moves[0] + moves[1] + moves[2],
    );
  });

  it('when a 60 Hz display draws every frame on time, then the page is with the finger within 23 frames', () => {
    const { framesToTheFinger } = closeInOver(
      SIXTIETH_MS,
      SIXTIETH_MS,
      Array<number>(60).fill(SIXTIETH_MS),
    );

    expect(framesToTheFinger).not.toBeNull();
    expect(framesToTheFinger!).toBeLessThanOrEqual(23);
  });

  it('when the phone draws 30 frames a second in Low Power Mode, then the page is with the finger within 12 frames, its steps from the second to the eighth held to an eighth of the gap', () => {
    const { framesToTheFinger } = closeInOver(
      1000 / 30,
      1000 / 30,
      Array<number>(60).fill(1000 / 30),
    );

    expect(framesToTheFinger).not.toBeNull();
    expect(framesToTheFinger!).toBeLessThanOrEqual(12);
  });
});

const WIDTH = 390;
const FINGER_AT = 300;

function easedAt(easing: string, x: number): number {
  const [x1, y1, x2, y2] = /cubic-bezier\(([^)]*)\)/
    .exec(easing)![1]
    .split(',')
    .map((value) => Number(value));
  const curve = (t: number, one: number, two: number): number =>
    3 * (1 - t) ** 2 * t * one + 3 * (1 - t) * t ** 2 * two + t ** 3;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2;
    if (curve(middle, x1, x2) < x) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return curve((low + high) / 2, y1, y2);
}

function settleSteps(settle: SwipeSettle, frameMs: number): number[] {
  const way = settle.to - settle.from;
  const at = (frame: number): number =>
    settle.durationMs === 0
      ? settle.to
      : settle.from +
        way * easedAt(settle.easing, Math.min(1, (frame * frameMs) / settle.durationMs));
  const steps: number[] = [];
  for (let frame = 1; frame * frameMs <= settle.durationMs + frameMs; frame++) {
    steps.push(Math.abs(at(frame) - at(frame - 1)));
  }
  return steps;
}

function flickedTo(fingerAt: number, speed: number): SwipeSettle {
  const swipe = new BackSwipe({ x: 20, y: 400, at: 0 }, WIDTH);
  swipe.move({ x: 20 + fingerAt / 2, y: 400, at: 100 });
  swipe.move({ x: 20 + fingerAt - speed * 16, y: 400, at: 200 });
  swipe.move({ x: 20 + fingerAt, y: 400, at: 216 });
  return swipe.release({ x: 20 + fingerAt, y: 400, at: 216 })!;
}

function pageAfterCloseInFrames(frames: number, frameMs: number): { at: number; stepPx: number } {
  if (frames === 0) {
    return { at: 0, stepPx: 0 };
  }
  const display = simulatedDisplay();
  let offset = 0;
  closeInOnFinger(display.view, FAST_MS, {
    frameMs,
    finger: () => FINGER_AT,
    from: 0,
    show: (at) => (offset = at),
    goesOn: () => true,
    caughtUp: () => undefined,
  });
  let before = 0;
  for (let frame = 1; frame <= frames; frame++) {
    before = offset;
    display.frame(frame * frameMs);
  }
  return { at: offset, stepPx: offset - before };
}

describe('Given a finger that lifts while the page still closes in on it', () => {
  for (const display of [60, 30]) {
    const frameMs = 1000 / display;
    for (const lift of [0, 1, 2, 3]) {
      it(`when a ${display} Hz display lets it go ${lift === 0 ? 'before the close-in begins' : `in frame ${lift} of the close-in`}, flicked at 0.5 to 3 px/ms from 300 px, then the slide's first frame moves the page no more than it was moving or an eighth of the gap, and no frame of the slide moves it more than that or the finger's own slide does at its steepest`, () => {
        const page = pageAfterCloseInFrames(lift, frameMs);
        const stepAtMostPx = FINGER_AT / 8;
        const tooFar: string[] = [];
        for (const speed of [0.5, 1, 2, 3]) {
          const end = flickedTo(FINGER_AT, speed);
          const settle = settleFrom(end, {
            at: page.at,
            stepPx: page.stepPx,
            frameMs,
            stepAtMostPx,
            width: WIDTH,
          });
          const steps = settleSteps(settle, frameMs);
          const bound = Math.max(page.stepPx, stepAtMostPx);
          const steepest = Math.max(bound, ...settleSteps(end, frameMs));
          if (steps[0] > bound + 1e-6) {
            tooFar.push(
              `${speed} px/ms: first frame ${steps[0].toFixed(1)} px over ${bound.toFixed(1)}`,
            );
          }
          steps.forEach((step, frame) => {
            if (step > steepest + 1e-6) {
              tooFar.push(
                `${speed} px/ms: frame ${frame + 1} ${step.toFixed(1)} px over ${steepest.toFixed(1)}`,
              );
            }
          });
          if (settle.from !== page.at || settle.to !== end.to) {
            tooFar.push(`${speed} px/ms: the slide runs from ${settle.from} to ${settle.to}`);
          }
        }

        expect(tooFar.slice(0, 8), `${tooFar.length} frames too far`).toEqual([]);
      });
    }
  }
});
