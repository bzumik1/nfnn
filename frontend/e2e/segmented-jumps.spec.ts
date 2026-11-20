import { expect, test } from './fixtures';
import { EdgeSample, jumpsOfTheEdges } from './segmented';

const FRAME_MS = 16.7;

function glide(lefts: number[], rights: number[]): EdgeSample[] {
  return lefts.map((left, index) => ({
    edges: [left, rights[index]],
    at: 1000 + index * FRAME_MS,
  }));
}

function withoutFrame(frames: EdgeSample[], dropped: number): EdgeSample[] {
  return frames.filter((_, index) => index !== dropped);
}

const start: [number, number] = [300, 450];
const lefts = [300, 300, 310, 340, 385, 430, 465, 490, 500, 500];
const rights = [450, 450, 458, 480, 514, 548, 575, 596, 610, 610];

test.describe('Given the edges of a segmented thumb sampled frame by frame', () => {
  test('when the thumb glides one step a frame, then no edge jumps', () => {
    expect(jumpsOfTheEdges(start, glide(lefts, rights))).toEqual([]);
  });

  test('when the loaded browser drops a frame in the middle of the glide, then the longer step after it is no jump', () => {
    expect(jumpsOfTheEdges(start, withoutFrame(glide(lefts, rights), 4))).toEqual([]);
  });

  test('when the loaded browser drops two frames in a row, then the step over both is no jump', () => {
    expect(jumpsOfTheEdges(start, withoutFrame(withoutFrame(glide(lefts, rights), 5), 4))).toEqual(
      [],
    );
  });

  test('when an edge leaps in a single frame, then it is a jump', () => {
    const leaping = glide(
      [300, 300, 310, 330, 480, 492, 498, 500, 500],
      [450, 450, 458, 474, 594, 604, 608, 610, 610],
    );

    expect(jumpsOfTheEdges(start, leaping)).toEqual([
      'left edge 330 → 480 in frame 4, 17 ms after the previous one',
      'right edge 474 → 594 in frame 4, 17 ms after the previous one',
    ]);
  });

  test('when the thumb lands on its place at once without a frame dropped, then it is a jump', () => {
    const snapping = glide([300, 500, 500], [450, 610, 610]);

    expect(jumpsOfTheEdges(start, snapping)).toEqual([
      'left edge 300 → 500 in frame 1, 17 ms after the previous one',
      'right edge 450 → 610 in frame 1, 17 ms after the previous one',
    ]);
  });

  test('when an edge steps back against the way it travels, then it is a jump', () => {
    const backwards = glide(
      [300, 330, 320, 360, 400, 440, 480, 500, 500],
      [450, 474, 466, 498, 530, 562, 594, 610, 610],
    );

    expect(jumpsOfTheEdges(start, backwards)).toEqual([
      'left edge 330 → 320 in frame 2, 17 ms after the previous one',
      'right edge 474 → 466 in frame 2, 17 ms after the previous one',
    ]);
  });
});
