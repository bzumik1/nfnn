import { TestBed } from '@angular/core/testing';
import { ScrollHold } from './scroll-hold';

describe('Given the scroll hold of a page transition', () => {
  let hold: ScrollHold;

  beforeEach(() => {
    hold = TestBed.inject(ScrollHold);
  });

  it('when nothing holds the scroll, then a scroll runs at once and a wait for the release too', () => {
    const order: string[] = [];

    hold.run(() => order.push('scroll'));
    hold.whenReleased(() => order.push('released'));

    expect(order).toEqual(['scroll', 'released']);
  });

  describe('when the scroll is held', () => {
    beforeEach(() => hold.hold());

    it('then only the last scroll runs on release, before the waits for the release', () => {
      const order: string[] = [];
      hold.run(() => order.push('first scroll'));
      hold.run(() => order.push('last scroll'));
      hold.whenReleased(() => order.push('released'));
      expect(order).toEqual([]);

      hold.release();

      expect(order).toEqual(['last scroll', 'released']);
    });

    it('then a wait given up before the release never runs', () => {
      const released = vi.fn();
      const giveUp = hold.whenReleased(released);

      giveUp();
      hold.release();

      expect(released).not.toHaveBeenCalled();
    });

    it('then it reports holding until it is released', () => {
      expect(hold.holding).toBe(true);

      hold.release();

      expect(hold.holding).toBe(false);
    });

    it('then a wait runs only once, though the scroll is released again', () => {
      const released = vi.fn();
      hold.whenReleased(released);

      hold.release();
      hold.release();

      expect(released).toHaveBeenCalledTimes(1);
    });
  });
});
