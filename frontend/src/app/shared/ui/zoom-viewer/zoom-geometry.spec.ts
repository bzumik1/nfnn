import { clampView, panBy, RESTING_VIEW, ZoomBounds, zoomAround, zoomStep } from './zoom-geometry';

const PHOTO_ON_A_PHONE: ZoomBounds = {
  stageWidth: 390,
  stageHeight: 700,
  contentWidth: 390,
  contentHeight: 244,
  maxScale: 4,
};

describe('Given a photo fitted into the viewer of a phone', () => {
  describe('when it is zoomed around its centre', () => {
    const view = zoomAround(RESTING_VIEW, 2, { x: 0, y: 0 }, PHOTO_ON_A_PHONE);

    it('then it grows in place', () => {
      expect(view).toEqual({ scale: 2, x: 0, y: 0 });
    });
  });

  describe('when it is zoomed around a point right of the centre', () => {
    const view = zoomAround(RESTING_VIEW, 2, { x: 100, y: 0 }, PHOTO_ON_A_PHONE);

    it('then that point stays under the finger', () => {
      expect(view.scale).toBe(2);
      expect(view.x).toBe(-100);
    });
  });

  it('when it is zoomed beyond the limit, then it stops at four times its size', () => {
    expect(zoomAround(RESTING_VIEW, 9, { x: 0, y: 0 }, PHOTO_ON_A_PHONE).scale).toBe(4);
  });

  it('when it is zoomed out below its fitted size, then it rests at its fitted size in the centre', () => {
    const zoomed = { scale: 3, x: -200, y: 150 };

    expect(zoomAround(zoomed, 0.4, { x: 50, y: 50 }, PHOTO_ON_A_PHONE)).toEqual(RESTING_VIEW);
  });

  it('when it is dragged while at its fitted size, then it does not move', () => {
    expect(panBy(RESTING_VIEW, 80, -40, PHOTO_ON_A_PHONE)).toEqual(RESTING_VIEW);
  });

  describe('when it is dragged at twice its size', () => {
    const zoomed = { scale: 2, x: 0, y: 0 };

    it('then it follows the finger', () => {
      expect(panBy(zoomed, 50, 0, PHOTO_ON_A_PHONE)).toEqual({ scale: 2, x: 50, y: 0 });
    });

    it('and the finger goes past its edge, then the edge stops at the edge of the screen', () => {
      expect(panBy(zoomed, 1000, 0, PHOTO_ON_A_PHONE)).toEqual({ scale: 2, x: 195, y: 0 });
    });

    it('and it is still shorter than the screen, then it does not move up or down', () => {
      expect(panBy(zoomed, 0, 120, PHOTO_ON_A_PHONE)).toEqual({ scale: 2, x: 0, y: 0 });
    });
  });

  it('when the screen turns and the view lies outside the photo, then it is moved back inside', () => {
    const turned: ZoomBounds = { ...PHOTO_ON_A_PHONE, stageWidth: 700, stageHeight: 390 };

    expect(clampView({ scale: 2, x: -300, y: 0 }, turned)).toEqual({ scale: 2, x: -40, y: 0 });
  });
});

describe('Given the zoom buttons of the viewer', () => {
  it('when the plus button is pressed at its fitted size, then the photo grows by half', () => {
    expect(zoomStep(1, 'in', 4)).toBe(1.5);
  });

  it('when the plus button is pressed close to the limit, then it stops at the limit', () => {
    expect(zoomStep(3.5, 'in', 4)).toBe(4);
  });

  it('when the minus button is pressed, then the photo shrinks by a third, never below its fitted size', () => {
    expect(zoomStep(3, 'out', 4)).toBe(2);
    expect(zoomStep(1.2, 'out', 4)).toBe(1);
  });
});
