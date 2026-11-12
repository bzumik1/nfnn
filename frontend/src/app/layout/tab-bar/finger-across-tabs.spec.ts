import { Box, hasLeftTap, pillCentre, tabUnderFinger } from './finger-across-tabs';

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height };
}

const BAR = box(20, 700, 400, 62);
const ONE_ROW = [
  box(22, 702, 99, 58),
  box(121, 702, 99, 58),
  box(220, 702, 99, 58),
  box(319, 702, 99, 58),
];
const TWO_ROWS = [
  box(22, 702, 198, 58),
  box(220, 702, 198, 58),
  box(22, 760, 198, 58),
  box(220, 760, 198, 58),
];
const TALL_BAR = box(20, 700, 400, 120);

describe('Given a finger pressed on the tab bar', () => {
  it('when it moves no further than the tap slop, then it is still a tap', () => {
    expect(hasLeftTap(6, 8)).toBe(false);
  });

  it('when it moves past the tap slop in any direction, then it drags', () => {
    expect(hasLeftTap(11, 0)).toBe(true);
    expect(hasLeftTap(0, -11)).toBe(true);
  });
});

describe('Given a finger dragging across a bar of one row', () => {
  it('when it rests over a tab, then that tab is under the finger', () => {
    expect(tabUnderFinger(250, 730, BAR, ONE_ROW)).toBe(2);
  });

  it('when it slides past either end of the bar, then the tab at that end stays under it', () => {
    expect(tabUnderFinger(-30, 730, BAR, ONE_ROW)).toBe(0);
    expect(tabUnderFinger(500, 730, BAR, ONE_ROW)).toBe(3);
  });

  it('when it slides below the bar, then the tab above it is under it', () => {
    expect(tabUnderFinger(150, 840, BAR, ONE_ROW)).toBe(1);
  });

  it('when it rises a little above the bar, then the tab below it is still under it', () => {
    expect(tabUnderFinger(150, 680, BAR, ONE_ROW)).toBe(1);
  });

  it('when it rises well above the bar, then no tab is under it and letting go cancels', () => {
    expect(tabUnderFinger(150, 670, BAR, ONE_ROW)).toBeNull();
  });
});

describe('Given a finger dragging across a bar of two rows at large text', () => {
  it('when it rests over the lower row, then the tab of that row is under it', () => {
    expect(tabUnderFinger(300, 790, TALL_BAR, TWO_ROWS)).toBe(3);
    expect(tabUnderFinger(100, 720, TALL_BAR, TWO_ROWS)).toBe(0);
  });
});

describe('Given the pill following a finger', () => {
  it('when motion is allowed, then its centre follows the finger along the row', () => {
    expect(pillCentre(200, ONE_ROW[1], ONE_ROW, true)).toEqual({ x: 200, y: 731 });
  });

  it('when the finger passes an end of the row, then the pill stops inside the bar', () => {
    expect(pillCentre(0, ONE_ROW[0], ONE_ROW, true)).toEqual({ x: 71.5, y: 731 });
    expect(pillCentre(500, ONE_ROW[3], ONE_ROW, true)).toEqual({ x: 368.5, y: 731 });
  });

  it('when reduced motion is asked for, then the pill jumps to the centre of the tab under the finger', () => {
    expect(pillCentre(200, ONE_ROW[1], ONE_ROW, false)).toEqual({ x: 170.5, y: 731 });
  });

  it('when the bar has two rows, then the pill stays in the row of the tab under the finger', () => {
    expect(pillCentre(300, TWO_ROWS[3], TWO_ROWS, true)).toEqual({ x: 300, y: 789 });
    expect(pillCentre(400, TWO_ROWS[3], TWO_ROWS, true)).toEqual({ x: 319, y: 789 });
  });
});
