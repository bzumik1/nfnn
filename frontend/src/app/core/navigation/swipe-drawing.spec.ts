import { BackSwipe, settleFrom, steepestStepOver, SwipeSettle } from './back-swipe';
import { closeInOnFinger, trackSettle } from './swipe-drawing';

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
    const { steps, framesToTheFinger } = closeInOver(
      1000 / 30,
      1000 / 30,
      Array<number>(60).fill(1000 / 30),
    );

    expect(framesToTheFinger).not.toBeNull();
    expect(framesToTheFinger!).toBeLessThanOrEqual(12);
    expect(
      steps.slice(1, 8).map((step) => Number(step.toFixed(3))),
      'the steps from the second to the eighth',
    ).toEqual(Array<number>(7).fill(STEP_AT_MOST));
  });
});

const WIDTH = 390;
const PAGE_STEP_MS = 350;

type Finger = 'still' | 'cancel' | number;

function releasedAt(fingerAt: number, finger: Finger): SwipeSettle {
  if (finger === 'cancel') {
    return {
      completes: false,
      from: fingerAt,
      to: 0,
      durationMs: PAGE_STEP_MS,
      easing: 'ease-out',
    };
  }
  const swipe = new BackSwipe({ x: 20, y: 400, at: 0 }, WIDTH);
  const speed = finger === 'still' ? 0 : finger;
  swipe.move({ x: 20 + fingerAt / 2, y: 400, at: 100 });
  swipe.move({ x: 20 + fingerAt - speed * 16, y: 400, at: 200 });
  swipe.move({ x: 20 + fingerAt, y: 400, at: 216 });
  return swipe.release({ x: 20 + fingerAt, y: 400, at: finger === 'still' ? 416 : 216 })!;
}

interface Lifted {
  readonly at: number;
  readonly stepPx: number;
}

function pageAfterCloseInFrames(
  frames: number,
  fingerAt: number,
  measuredMs: number,
  frameMs: number,
): Lifted {
  if (frames === 0) {
    return { at: 0, stepPx: 0 };
  }
  const display = simulatedDisplay();
  let offset = 0;
  closeInOnFinger(display.view, FAST_MS, {
    frameMs: measuredMs,
    finger: () => fingerAt,
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

interface Settled {
  readonly steps: number[];
  readonly arrivedMs: number | null;
}

function settledFrom(
  end: SwipeSettle,
  page: Lifted,
  fingerAt: number,
  measuredMs: number,
  frameMs: number,
): Settled {
  const display = simulatedDisplay();
  const plan = settleFrom(end, page.at, WIDTH);
  const shown = [page.at];
  let arrivedMs: number | null = null;
  void trackSettle(display.view, {
    plan,
    finger: end,
    frameMs: measuredMs,
    firstStepAtMost: Math.max(Math.sign(plan.to - page.at) * page.stepPx, fingerAt / 8),
    show: (at) => shown.push(at),
    goesOn: () => arrivedMs === null,
  });
  for (let frame = 1; frame <= 200 && arrivedMs === null; frame++) {
    display.frame(frame * frameMs);
    if (shown.at(-1) === plan.to) {
      arrivedMs = frame * frameMs;
    }
  }
  return { steps: shown.slice(1).map((at, frame) => at - shown[frame]), arrivedMs };
}

describe('Given a finger that lifts or is called off while the page still closes in on it', () => {
  for (const { display, frameMs } of [
    { display: '60 Hz', frameMs: SIXTIETH_MS },
    { display: '120 Hz', frameMs: 1000 / 120 },
    { display: '30 Hz', frameMs: 1000 / 30 },
  ]) {
    for (const measuredMs of [frameMs, 34]) {
      it(`when a ${display} display, ${measuredMs.toFixed(1)} ms measured, lets it go before the close-in or in any of its first 8 frames, 30, 120 or 300 px behind, still, slowly, flicked up to 3 px/ms or called off, then the slide's first frame moves the page no more than it was moving or an eighth of the gap, no frame more than that or the finger's own slide at its steepest, every frame towards its end, and it arrives within 1.5 times the finger's own slide or 400 ms`, () => {
        const wrong: string[] = [];
        for (const fingerAt of [30, 120, 300]) {
          for (let lift = 0; lift <= 8; lift++) {
            const page = pageAfterCloseInFrames(lift, fingerAt, measuredMs, frameMs);
            for (const finger of ['still', 0.2, 0.5, 1, 2, 3, 'cancel'] as Finger[]) {
              const end = releasedAt(fingerAt, finger);
              const way = Math.sign(end.to - page.at);
              const firstAtMost = Math.max(way * page.stepPx, fingerAt / 8);
              const anyAtMost = Math.max(firstAtMost, steepestStepOver(end, frameMs));
              const arriveWithin = Math.max(end.durationMs * 1.5, 400);
              const { steps, arrivedMs } = settledFrom(end, page, fingerAt, measuredMs, frameMs);
              const kase = `${fingerAt} px, lift ${lift}, ${finger}`;
              if (Math.abs(steps[0] ?? 0) > firstAtMost + 1e-6) {
                wrong.push(
                  `${kase}: first frame ${Math.abs(steps[0]).toFixed(1)} over ${firstAtMost.toFixed(1)}`,
                );
              }
              steps.forEach((step, frame) => {
                if (Math.abs(step) > anyAtMost + 1e-6) {
                  wrong.push(
                    `${kase}: frame ${frame + 1} ${Math.abs(step).toFixed(1)} over ${anyAtMost.toFixed(1)}`,
                  );
                }
                if (way * step < -1e-6) {
                  wrong.push(`${kase}: frame ${frame + 1} went back ${step.toFixed(1)}`);
                }
              });
              if (arrivedMs === null || arrivedMs > arriveWithin + frameMs) {
                wrong.push(
                  `${kase}: arrived after ${arrivedMs?.toFixed(0)} ms, over ${arriveWithin.toFixed(0)}`,
                );
              }
            }
          }
        }

        expect(wrong.slice(0, 8), `${wrong.length} wrong`).toEqual([]);
      });
    }
  }
});

describe('Given a phone whose close-in and settle are judged from the app’s own values', () => {
  it('when the page closes in on a finger 220 px ahead and the finger then lets go, then each drawn frame of the close-in marks how far the page is behind, how much of that it closed and the gap it started from, and the first frame of the settle marks its step and its bound', () => {
    const display = simulatedDisplay();
    const marks: { name: string; detail: Record<string, unknown> }[] = [];
    (display.view.performance as { mark?: unknown }).mark = (
      name: string,
      options: { detail: Record<string, unknown> },
    ) => marks.push({ name, detail: options.detail });
    let caught = false;
    closeInOnFinger(display.view, FAST_MS, {
      frameMs: SIXTIETH_MS,
      finger: () => START_GAP,
      from: 0,
      show: () => undefined,
      goesOn: () => !caught,
      caughtUp: () => (caught = true),
    });
    for (let frame = 1; frame <= 3; frame++) {
      display.frame(frame * SIXTIETH_MS);
    }
    caught = true;
    const end = releasedAt(120, 1);
    void trackSettle(display.view, {
      plan: settleFrom(end, 82.5, WIDTH),
      finger: end,
      frameMs: SIXTIETH_MS,
      firstStepAtMost: STEP_AT_MOST,
      show: () => undefined,
      goesOn: () => true,
    });
    display.frame(4 * SIXTIETH_MS);
    const closeIn = marks
      .filter((mark) => mark.name === 'nfnn.close-in')
      .map((mark) => mark.detail);
    const settleFirst = marks
      .filter((mark) => mark.name === 'nfnn.settle-first')
      .map((mark) => mark.detail);

    expect(closeIn).toHaveLength(3);
    closeIn.forEach((detail, frame) => {
      const behindBefore = frame === 0 ? START_GAP : (closeIn[frame - 1]['behind'] as number);
      expect(detail).toEqual({
        behind: behindBefore - (detail['step'] as number),
        step: expect.any(Number),
        gap0: START_GAP,
        drawn: true,
      });
      expect(detail['step'] as number).toBeGreaterThan(0);
      expect(detail['step'] as number).toBeLessThanOrEqual(STEP_AT_MOST + 1e-9);
    });
    expect(settleFirst).toEqual([
      { from: 82.5, step: expect.any(Number), atMost: STEP_AT_MOST, drawn: true },
    ]);
    expect(settleFirst[0]['step'] as number).toBeGreaterThan(0);
    expect(settleFirst[0]['step'] as number).toBeLessThanOrEqual(STEP_AT_MOST + 1e-9);
  });
});

describe('Given a browser that draws a frame only every 600 ms while the page settles after a lift', () => {
  it('when the finger lets go 120 px behind where it slid the page, then the page still arrives within 1.5 times the finger’s own slide or 400 ms and three frames, plus the one frame that shows it, never crawling on by an eighth of the gap each slow frame', () => {
    const display = simulatedDisplay();
    const end = releasedAt(300, 'still');
    const plan = settleFrom(end, 180, WIDTH);
    let shown = 180;
    let arrivedMs: number | null = null;
    void trackSettle(display.view, {
      plan,
      finger: end,
      frameMs: SIXTIETH_MS,
      firstStepAtMost: 300 / 8,
      show: (at) => (shown = at),
      goesOn: () => arrivedMs === null,
    });
    for (let frame = 1; frame <= 20 && arrivedMs === null; frame++) {
      display.frame(frame * 600);
      if (shown === plan.to) {
        arrivedMs = frame * 600;
      }
    }
    const arriveBy = Math.max(1.5 * end.durationMs, 400) + 3 * SIXTIETH_MS + 600;

    expect(arrivedMs, `the page stood at ${shown.toFixed(1)}`).not.toBeNull();
    expect(arrivedMs!).toBeLessThanOrEqual(arriveBy);
  });
});
