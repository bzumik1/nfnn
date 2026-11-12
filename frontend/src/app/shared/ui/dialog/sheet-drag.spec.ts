import { canPullSheetFrom, pullIntent, SheetDrag } from './sheet-drag';

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

describe('Given a sheet that the visitor drags while letting go', () => {
  let drag: SheetDrag;

  beforeEach(() => {
    drag = new SheetDrag();
    drag.start(100, 0);
  });

  it('when the finger is moving back up as it lets go far down, then the visitor changed their mind and the sheet returns', () => {
    drag.move(320, 1000);
    drag.move(300, 1020);

    expect(drag.end(400, 1030)).toBe('return');
  });

  it('when the finger rests far down before letting go, then the sheet closes', () => {
    drag.move(320, 1000);

    expect(drag.end(400, 1300)).toBe('dismiss');
  });
});

describe('Given a sheet that cannot be dismissed by a drag', () => {
  let drag: SheetDrag;

  beforeEach(() => {
    drag = new SheetDrag();
    drag.start(100, 0, true);
  });

  it('when the finger moves down, then the sheet follows it less and less', () => {
    const first = drag.move(140, 100);
    const second = drag.move(180, 200) - first;
    const third = drag.move(220, 300) - first - second;

    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(40);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it('when the finger goes a whole screen down, then the sheet stays within a short reach', () => {
    expect(drag.move(1000, 1000)).toBeLessThan(100);
  });

  it('when the finger lets go far down, then the drag still reads as a wish to close it', () => {
    drag.move(320, 1000);

    expect(drag.end(400, 1000)).toBe('dismiss');
  });
});

describe('Given a finger that touched the content of a sheet', () => {
  const origin = { x: 100, y: 100, time: 0 };

  it('when it has moved only a few pixels, then it is not yet decided what it moves', () => {
    expect(pullIntent(origin, 104, 106, 50)).toBe('undecided');
  });

  it('when it moves down, then it pulls the sheet', () => {
    expect(pullIntent(origin, 104, 120, 50)).toBe('sheet');
  });

  it('when it moves up, then it scrolls the content', () => {
    expect(pullIntent(origin, 100, 80, 50)).toBe('content');
  });

  it('when it moves more sideways than down, then it is left to the content', () => {
    expect(pullIntent(origin, 120, 112, 50)).toBe('content');
  });

  it('when it rested before moving, then it is a long press for the content, not a pull', () => {
    expect(pullIntent(origin, 100, 130, 400)).toBe('content');
  });
});

describe('Given where a pull of a sheet starts', () => {
  let panel: HTMLElement;

  beforeEach(() => {
    panel = document.createElement('div');
    panel.innerHTML = `
      <p id="text">Text</p>
      <input id="field" />
      <textarea id="notes"></textarea>
      <input id="range" type="range" />
      <select id="choice"><option>A</option></select>
      <div id="list"><button id="row" type="button">Řádek</button></div>
      <app-zoomable><button id="photo" type="button">Fotka</button></app-zoomable>
    `;
    document.body.appendChild(panel);
  });

  afterEach(() => panel.remove());

  const at = (id: string) => panel.querySelector(`#${id}`) as HTMLElement;

  it('when the content is scrolled to its top, then text and buttons can pull the sheet', () => {
    expect(canPullSheetFrom(at('text'), panel)).toBe(true);
    expect(canPullSheetFrom(at('row'), panel)).toBe(true);
  });

  it('when the content is scrolled down, then the touch scrolls it instead', () => {
    panel.scrollTop = 40;

    expect(canPullSheetFrom(at('text'), panel)).toBe(false);
  });

  it('when a list inside the content is scrolled down, then the touch scrolls the list', () => {
    at('list').scrollTop = 20;

    expect(canPullSheetFrom(at('row'), panel)).toBe(false);
  });

  it('when a text field is not focused, then it can pull the sheet like the text around it', () => {
    expect(canPullSheetFrom(at('field'), panel)).toBe(true);
  });

  it('when the touched text field is focused, then the touch is left to its caret and selection', () => {
    at('field').focus();

    expect(canPullSheetFrom(at('field'), panel)).toBe(false);
  });

  it('when it starts on a text area, a slider, a choice or a zoomable photo, then they keep their own gestures', () => {
    expect(canPullSheetFrom(at('notes'), panel)).toBe(false);
    expect(canPullSheetFrom(at('range'), panel)).toBe(false);
    expect(canPullSheetFrom(at('choice'), panel)).toBe(false);
    expect(canPullSheetFrom(at('photo'), panel)).toBe(false);
  });

  it('when some text is selected, then the touch is left to the selection', () => {
    const selection = document.getSelection()!;
    selection.selectAllChildren(at('text'));

    expect(canPullSheetFrom(at('row'), panel)).toBe(false);
    selection.removeAllRanges();
  });
});
