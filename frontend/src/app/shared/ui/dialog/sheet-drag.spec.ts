import { SheetDrag } from './sheet-drag';

describe('Given a sheet that the visitor drags by its top edge', () => {
  let drag: SheetDrag;

  beforeEach(() => {
    drag = new SheetDrag();
    drag.start(100, 0);
  });

  it('when the finger moves down, then the sheet follows it', () => {
    expect(drag.move(160, 100)).toBe(60);
  });

  it('when the finger moves up past where it started, then the sheet stays where it opened', () => {
    expect(drag.move(40, 100)).toBe(0);
  });

  it('when the finger lets go after a quarter of the sheet slowly, then the sheet closes', () => {
    drag.move(220, 1000);

    expect(drag.end(400, 1000)).toBe('dismiss');
  });

  it('when the finger lets go after a short slow way, then the sheet returns', () => {
    drag.move(150, 1000);

    expect(drag.end(400, 1000)).toBe('return');
  });

  it('when the finger flicks down quickly, then the sheet closes even after a short way', () => {
    drag.move(120, 1000);
    drag.move(150, 1040);

    expect(drag.end(400, 1050)).toBe('dismiss');
  });

  it('when a quick flick goes only a few pixels, then it was a tap and the sheet returns', () => {
    drag.move(108, 10);

    expect(drag.end(400, 10)).toBe('return');
  });

  it('when a low sheet is dragged, then it still takes a few finger widths to close it', () => {
    drag.move(150, 1000);

    expect(drag.end(0, 1000)).toBe('return');
  });

  it('when the finger flicks down and then rests before letting go, then the flick is spent and the sheet returns', () => {
    drag.move(140, 40);

    expect(drag.end(400, 300)).toBe('return');
  });

  it('when the browser takes the gesture over, then the sheet returns whatever the way', () => {
    drag.move(300, 1000);
    drag.cancel();

    expect(drag.end(400, 1000)).toBe('return');
  });

  it('when no drag started, then letting go leaves the sheet where it is', () => {
    const idle = new SheetDrag();

    expect(idle.move(300, 10)).toBe(0);
    expect(idle.end(400, 10)).toBe('return');
  });
});
