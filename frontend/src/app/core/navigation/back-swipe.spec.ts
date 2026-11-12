import { BackSwipe, SwipePoint } from './back-swipe';

const WIDTH = 390;

function swipeThrough(points: readonly SwipePoint[]): BackSwipe {
  const [first, ...rest] = points;
  const swipe = new BackSwipe(first, WIDTH);
  rest.forEach((point) => swipe.move(point));
  return swipe;
}

function startSlopeOf(easing: string): number {
  const [x1, y1] = /cubic-bezier\(([^)]*)\)/
    .exec(easing)![1]
    .split(',')
    .map((value) => Number.parseFloat(value));
  return y1 / x1;
}

describe('Given a finger that lands on a page with somewhere to go back to', () => {
  it('when it has not moved past the slop of a tap, then the page does not follow it yet', () => {
    const swipe = swipeThrough([
      { x: 100, y: 300, at: 0 },
      { x: 108, y: 304, at: 40 },
    ]);

    expect(swipe.dragging).toBe(false);
    expect(swipe.abandoned).toBe(false);
    expect(swipe.offset).toBe(0);
  });

  it('when it moves right more than sideways, then the page follows it across', () => {
    const swipe = swipeThrough([
      { x: 100, y: 300, at: 0 },
      { x: 130, y: 310, at: 40 },
      { x: 180, y: 360, at: 80 },
    ]);

    expect(swipe.dragging).toBe(true);
    expect(swipe.offset).toBe(80);
  });

  it('when it moves up or down first, then it scrolls the page and the swipe is off for good', () => {
    const swipe = swipeThrough([
      { x: 100, y: 300, at: 0 },
      { x: 112, y: 320, at: 40 },
      { x: 300, y: 320, at: 120 },
    ]);

    expect(swipe.abandoned).toBe(true);
    expect(swipe.offset).toBe(0);
    expect(swipe.release({ x: 300, y: 320, at: 130 })).toBeNull();
  });

  it('when it moves left first, then it is no swipe back', () => {
    const swipe = swipeThrough([
      { x: 300, y: 300, at: 0 },
      { x: 280, y: 300, at: 40 },
    ]);

    expect(swipe.abandoned).toBe(true);
  });

  it('when it is held still before it moves, as when selecting text, then it is no swipe back', () => {
    const swipe = swipeThrough([
      { x: 100, y: 300, at: 0 },
      { x: 101, y: 300, at: 600 },
      { x: 200, y: 300, at: 700 },
    ]);

    expect(swipe.abandoned).toBe(true);
  });

  it('when it goes left of where it landed while the page follows, then the page rests at its place and goes no further', () => {
    const swipe = swipeThrough([
      { x: 100, y: 300, at: 0 },
      { x: 140, y: 300, at: 40 },
      { x: 60, y: 300, at: 120 },
    ]);

    expect(swipe.dragging).toBe(true);
    expect(swipe.offset).toBe(0);
  });

  it('when it wanders up or down once the page follows, then the page keeps following only across', () => {
    const swipe = swipeThrough([
      { x: 100, y: 300, at: 0 },
      { x: 140, y: 300, at: 40 },
      { x: 160, y: 420, at: 120 },
    ]);

    expect(swipe.dragging).toBe(true);
    expect(swipe.offset).toBe(60);
  });
});

describe('Given a page that follows a finger across', () => {
  it('when the finger lets go past half the width and rests, then the page goes back', () => {
    const swipe = swipeThrough([
      { x: 20, y: 300, at: 0 },
      { x: 120, y: 300, at: 200 },
      { x: 240, y: 300, at: 600 },
    ]);

    const settle = swipe.release({ x: 240, y: 300, at: 900 });

    expect(settle).toMatchObject({ completes: true, from: 220, to: WIDTH });
  });

  it('when the finger lets go short of half the width and rests, then the page slides back in place', () => {
    const swipe = swipeThrough([
      { x: 20, y: 300, at: 0 },
      { x: 120, y: 300, at: 200 },
      { x: 180, y: 300, at: 600 },
    ]);

    const settle = swipe.release({ x: 180, y: 300, at: 900 });

    expect(settle).toMatchObject({ completes: false, from: 160, to: 0 });
  });

  it('when a short quick flick lets go short of half the width, then its speed carries the page back', () => {
    const swipe = swipeThrough([
      { x: 140, y: 300, at: 0 },
      { x: 160, y: 302, at: 40 },
      { x: 200, y: 302, at: 80 },
    ]);

    expect(swipe.release({ x: 200, y: 302, at: 90 })?.completes).toBe(true);
  });

  it('when a quick flick rested before the finger let go, then its speed is spent and the page slides back', () => {
    const swipe = swipeThrough([
      { x: 140, y: 300, at: 0 },
      { x: 160, y: 302, at: 20 },
      { x: 200, y: 302, at: 40 },
    ]);

    expect(swipe.release({ x: 200, y: 302, at: 400 })?.completes).toBe(false);
  });

  it('when a flick moves the page less than a small step, then the page slides back', () => {
    const swipe = swipeThrough([
      { x: 140, y: 300, at: 0 },
      { x: 152, y: 300, at: 6 },
      { x: 170, y: 300, at: 12 },
    ]);

    expect(swipe.release({ x: 170, y: 300, at: 14 })?.completes).toBe(false);
  });

  it('when the finger heads back left as it lets go past half the width, then the page slides back in place', () => {
    const swipe = swipeThrough([
      { x: 20, y: 300, at: 0 },
      { x: 360, y: 300, at: 150 },
      { x: 330, y: 300, at: 200 },
    ]);

    expect(swipe.release({ x: 330, y: 300, at: 210 })?.completes).toBe(false);
  });

  it('when it settles from rest, then the page takes at most the time of a whole width and starts gently', () => {
    const swipe = swipeThrough([
      { x: 20, y: 300, at: 0 },
      { x: 120, y: 300, at: 200 },
      { x: 240, y: 300, at: 600 },
    ]);

    const settle = swipe.release({ x: 240, y: 300, at: 900 })!;

    expect(settle.durationMs).toBeGreaterThanOrEqual(150);
    expect(settle.durationMs).toBeLessThanOrEqual(350);
    expect(startSlopeOf(settle.easing)).toBe(0);
  });

  it('when it settles after a quick flick, then it is quicker and leaves at the speed of the finger', () => {
    const swipe = swipeThrough([
      { x: 20, y: 300, at: 0 },
      { x: 100, y: 300, at: 80 },
      { x: 220, y: 300, at: 160 },
    ]);

    const settle = swipe.release({ x: 220, y: 300, at: 165 })!;
    const fingerSpeed = 1.5;
    const pageSpeed = (startSlopeOf(settle.easing) * (WIDTH - 200)) / settle.durationMs;

    expect(settle.completes).toBe(true);
    expect(settle.durationMs).toBe(150);
    expect(pageSpeed).toBeCloseTo(fingerSpeed, 1);
  });

  it('when the finger lets go where it landed, then nothing has to move', () => {
    const swipe = swipeThrough([
      { x: 100, y: 300, at: 0 },
      { x: 140, y: 300, at: 40 },
      { x: 100, y: 300, at: 400 },
    ]);

    expect(swipe.release({ x: 100, y: 300, at: 700 })).toMatchObject({
      completes: false,
      from: 0,
      to: 0,
      durationMs: 0,
    });
  });
});
