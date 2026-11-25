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

  it('when a 60 Hz display draws every frame on time, then the page is with the finger within 23 frames', () => {
    const { framesToTheFinger } = closeInOver(
      SIXTIETH_MS,
      SIXTIETH_MS,
      Array<number>(60).fill(SIXTIETH_MS),
    );

    expect(framesToTheFinger).not.toBeNull();
    expect(framesToTheFinger!).toBeLessThanOrEqual(23);
  });

  it('when the phone draws 30 frames a second in Low Power Mode, then the page is with the finger within 14 frames', () => {
    const { framesToTheFinger } = closeInOver(
      1000 / 30,
      1000 / 30,
      Array<number>(60).fill(1000 / 30),
    );

    expect(framesToTheFinger).not.toBeNull();
    expect(framesToTheFinger!).toBeLessThanOrEqual(14);
  });
});
