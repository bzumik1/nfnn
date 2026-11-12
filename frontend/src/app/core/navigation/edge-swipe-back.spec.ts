import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { appConfig } from '../../app.config';
import { DirtyForms } from '../updates/dirty-forms';
import { BackTarget } from './back-target';
import { EdgeSwipeBack, edgeSwipeBackAtStart } from './edge-swipe-back';
import { PageTransitions, SwipePreview } from './page-transitions';
import { Chrome, RouteChrome } from './route-chrome';

interface Device {
  readonly standalone: boolean | undefined;
  readonly maxTouchPoints: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

const IPHONE_HOME_SCREEN: Device = { standalone: true, maxTouchPoints: 5 };
const IPHONE_SAFARI_TAB: Device = { standalone: false, maxTouchPoints: 5 };

let location: { back: ReturnType<typeof vi.fn> };
let backTarget: {
  canGoBack: boolean;
  back: ReturnType<typeof vi.fn>;
  destination: ReturnType<typeof vi.fn>;
};
let transitions: { startSwipe: ReturnType<typeof vi.fn> };
let dirty: boolean;
let chrome: ReturnType<typeof signal<Chrome>>;
let pendingNavigation: ReturnType<typeof signal<object | null>>;
let page: HTMLElement;

function chromeWith(parent: string | null): Chrome {
  return {
    parent,
    head: 'dark',
    tabBar: true,
    landing: false,
    phoneFooter: false,
    backOnWide: true,
  };
}

function runOn(device: Device): void {
  Object.defineProperty(navigator, 'standalone', {
    configurable: true,
    get: () => device.standalone,
  });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    get: () => device.maxTouchPoints,
  });
  TestBed.configureTestingModule({
    providers: [
      edgeSwipeBackAtStart,
      { provide: Location, useValue: location },
      { provide: BackTarget, useValue: backTarget },
      { provide: PageTransitions, useValue: transitions },
      { provide: DirtyForms, useValue: { any: () => dirty } },
      { provide: RouteChrome, useValue: { current: chrome.asReadonly() } },
      { provide: Router, useValue: { currentNavigation: pendingNavigation.asReadonly() } },
    ],
  });
  TestBed.inject(EdgeSwipeBack);
}

function touch(type: string, target: EventTarget, point: Point, fingers = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const changed = [{ identifier: 1, clientX: point.x, clientY: point.y }];
  const down = type === 'touchend' || type === 'touchcancel' ? [] : changed;
  const touches = fingers > 1 ? [...down, { identifier: 2, clientX: 200, clientY: 200 }] : down;
  Object.defineProperty(event, 'changedTouches', { value: changed });
  Object.defineProperty(event, 'touches', { value: touches });
  Object.defineProperty(event, 'timeStamp', { value: point.at });
  target.dispatchEvent(event);
  return event;
}

function drag(target: EventTarget, points: readonly Point[]): { start: Event; end: Event } {
  const [first, ...rest] = points;
  const start = touch('touchstart', target, first);
  rest.forEach((point) => touch('touchmove', target, point));
  const end = touch('touchend', target, rest.at(-1) ?? first);
  return { start, end };
}

function openDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  return dialog;
}

const ACROSS: readonly Point[] = [
  { x: 120, y: 300, at: 0 },
  { x: 400, y: 300, at: 300 },
];

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  location = { back: vi.fn() };
  backTarget = {
    canGoBack: true,
    back: vi.fn(),
    destination: vi.fn(() => ({ kind: 'step', depth: 0, path: '/aktuality' })),
  };
  transitions = { startSwipe: vi.fn(() => null) };
  dirty = false;
  chrome = signal(chromeWith('/aktuality'));
  pendingNavigation = signal<object | null>(null);
  page = document.createElement('main');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Zpět';
  const field = document.createElement('input');
  field.setAttribute('aria-label', 'Částka');
  page.append(button, field);
  document.body.append(page);
});

afterEach(() => {
  TestBed.inject(EdgeSwipeBack).stop();
  page.remove();
  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
  delete (navigator as { standalone?: boolean }).standalone;
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
  delete (window as { innerWidth?: number }).innerWidth;
});

describe('Given the app opened from the home screen of an iPhone', () => {
  beforeEach(() => runOn(IPHONE_HOME_SCREEN));

  it('when a finger lands anywhere, then the page keeps the touch for its scroll, taps and the system', () => {
    const atEdge = touch('touchstart', page, { x: 8, y: 300, at: 0 });
    touch('touchend', page, { x: 8, y: 300, at: 50 });
    const inMiddle = touch('touchstart', page, { x: 180, y: 300, at: 100 });
    const end = touch('touchend', page, { x: 180, y: 300, at: 150 });

    expect([atEdge.defaultPrevented, inMiddle.defaultPrevented, end.defaultPrevented]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('when a tap lands at the edge on a button, then the button gets the browser’s own click and no other', () => {
    const button = page.querySelector('button') as HTMLButtonElement;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    drag(button, [
      { x: 6, y: 300, at: 0 },
      { x: 7, y: 301, at: 80 },
    ]);

    expect(clicked).not.toHaveBeenCalled();
    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when a swipe goes a third of the screen across and rests before letting go, then nothing happens', () => {
    drag(page, [
      { x: 20, y: 300, at: 0 },
      { x: 90, y: 302, at: 200 },
      { x: 160, y: 304, at: 400 },
      { x: 160, y: 304, at: 700 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a swipe goes past half the screen and rests before letting go, then the app goes back as Zpět does', () => {
    drag(page, [
      { x: 20, y: 300, at: 0 },
      { x: 120, y: 302, at: 200 },
      { x: 230, y: 304, at: 400 },
      { x: 230, y: 304, at: 700 },
    ]);

    expect(backTarget.back).toHaveBeenCalledExactlyOnceWith('/aktuality');
  });

  it('when a swipe from the middle of the screen moves on across as the finger lets go, then the app goes back as Zpět does', () => {
    drag(page, [
      { x: 160, y: 300, at: 0 },
      { x: 260, y: 305, at: 200 },
      { x: 330, y: 310, at: 400 },
    ]);

    expect(backTarget.back).toHaveBeenCalledExactlyOnceWith('/aktuality');
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a swipe from the left edge goes a third of the screen across, then the app goes back too', () => {
    drag(page, [
      { x: 6, y: 300, at: 0 },
      { x: 150, y: 305, at: 200 },
      { x: 400, y: 310, at: 400 },
    ]);

    expect(backTarget.back).toHaveBeenCalledExactlyOnceWith('/aktuality');
  });

  it('when a short quick flick goes right, then the app goes back as Zpět does', () => {
    drag(page, [
      { x: 140, y: 300, at: 0 },
      { x: 200, y: 302, at: 80 },
    ]);

    expect(backTarget.back).toHaveBeenCalledExactlyOnceWith('/aktuality');
  });

  it('when a short swipe was quick but the finger rested before letting go, then nothing happens', () => {
    drag(page, [
      { x: 140, y: 300, at: 0 },
      { x: 200, y: 302, at: 40 },
      { x: 200, y: 302, at: 600 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a swipe stops short and slow, then nothing happens', () => {
    drag(page, [
      { x: 140, y: 300, at: 0 },
      { x: 206, y: 302, at: 900 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a swipe goes left, then it is no swipe back', () => {
    drag(page, [
      { x: 380, y: 300, at: 0 },
      { x: 60, y: 300, at: 200 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when the finger goes far across and comes back before letting go, then the swipe is called off', () => {
    drag(page, [
      { x: 6, y: 300, at: 0 },
      { x: 500, y: 300, at: 150 },
      { x: 420, y: 300, at: 250 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when the finger scrolls the page up or down first, then it is no swipe back', () => {
    drag(page, [
      { x: 120, y: 300, at: 0 },
      { x: 134, y: 380, at: 100 },
      { x: 400, y: 420, at: 200 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when the finger is held still before it moves, as when selecting text, then it is no swipe back', () => {
    drag(page, [
      { x: 120, y: 300, at: 0 },
      { x: 121, y: 300, at: 700 },
      { x: 400, y: 300, at: 900 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when a second finger joins, then it is no swipe back', () => {
    touch('touchstart', page, { x: 120, y: 300, at: 0 }, 2);
    touch('touchmove', page, { x: 400, y: 300, at: 100 });
    touch('touchend', page, { x: 400, y: 300, at: 200 });

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when the system cancels the touch, then it is no swipe back', () => {
    touch('touchstart', page, { x: 120, y: 300, at: 0 });
    touch('touchmove', page, { x: 400, y: 300, at: 100 });
    touch('touchcancel', page, { x: 400, y: 300, at: 150 });
    touch('touchend', page, { x: 400, y: 300, at: 200 });

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when the page went back by itself during the swipe, then the app takes no second step', () => {
    touch('touchstart', page, { x: 120, y: 300, at: 0 });
    touch('touchmove', page, { x: 400, y: 300, at: 100 });
    window.dispatchEvent(new PopStateEvent('popstate'));
    touch('touchend', page, { x: 400, y: 300, at: 200 });

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a swipe starts in a field, then the field keeps it for its caret and selection', () => {
    const field = page.querySelector('input') as HTMLInputElement;

    drag(field, ACROSS);

    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when a swipe starts on a part that handles its own touches, as the zoomed photo does, then the app does not go back', () => {
    const stage = document.createElement('div');
    stage.style.touchAction = 'none';
    const inner = document.createElement('img');
    stage.append(inner);
    page.append(stage);

    drag(inner, ACROSS);

    expect(backTarget.back).not.toHaveBeenCalled();
  });

  describe('when a swipe starts in a row that scrolls sideways, as the year stories do', () => {
    let row: HTMLElement;
    let card: HTMLElement;

    beforeEach(() => {
      row = document.createElement('div');
      row.style.overflowX = 'auto';
      card = document.createElement('article');
      row.append(card);
      page.append(row);
    });

    it('and the row has more to show, then the row scrolls and the app does not go back', () => {
      Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 900 });
      Object.defineProperty(row, 'clientWidth', { configurable: true, value: 360 });

      drag(card, ACROSS);

      expect(backTarget.back).not.toHaveBeenCalled();
    });

    it('and everything in the row fits, then the swipe still goes back', () => {
      Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 360 });
      Object.defineProperty(row, 'clientWidth', { configurable: true, value: 360 });

      drag(card, ACROSS);

      expect(backTarget.back).toHaveBeenCalledTimes(1);
    });
  });

  it('when the page is a tab root, then a swipe does nothing, even with pages behind', () => {
    chrome.set(chromeWith(null));

    drag(page, ACROSS);

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a dialog is open, then a swipe steps back in its history, which closes it or its last step', () => {
    const dialog = openDialog();

    drag(dialog, ACROSS);

    expect(location.back).toHaveBeenCalledTimes(1);
    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when a dialog asks before a navigation leaves the page, then a swipe dismisses it as Esc does', () => {
    pendingNavigation.set({});
    const dialog = openDialog();
    const cancelled = vi.fn();
    dialog.addEventListener('cancel', cancelled);

    drag(dialog, ACROSS);

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when that dialog refuses to be dismissed, then it stays open', () => {
    pendingNavigation.set({});
    const dialog = openDialog();
    dialog.addEventListener('cancel', (event) => event.preventDefault());

    drag(dialog, ACROSS);

    expect(dialog.open).toBe(true);
  });
});

describe('Given the app opened from the home screen of an iPhone, which shows the page behind the finger', () => {
  let preview: {
    follow: ReturnType<typeof vi.fn>;
    settle: ReturnType<typeof vi.fn>;
    slideBack: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    preview = {
      follow: vi.fn(),
      settle: vi.fn(() => Promise.resolve()),
      slideBack: vi.fn(() => Promise.resolve()),
    };
    transitions.startSwipe.mockImplementation(() => preview as SwipePreview);
    runOn(IPHONE_HOME_SCREEN);
  });

  it('when a finger takes the page, then the page Zpět leads to shows under it and the page follows the finger across', () => {
    touch('touchstart', page, { x: 20, y: 300, at: 0 });
    touch('touchmove', page, { x: 60, y: 302, at: 40 });
    touch('touchmove', page, { x: 140, y: 304, at: 80 });

    expect(backTarget.destination).toHaveBeenCalledWith('/aktuality');
    expect(transitions.startSwipe).toHaveBeenCalledExactlyOnceWith({
      kind: 'step',
      depth: 0,
      path: '/aktuality',
    });
    expect(preview.follow.mock.calls).toEqual([[40], [120]]);
  });

  it('when the finger has not taken the page yet, then nothing shows under it', () => {
    touch('touchstart', page, { x: 20, y: 300, at: 0 });
    touch('touchmove', page, { x: 25, y: 302, at: 40 });

    expect(transitions.startSwipe).not.toHaveBeenCalled();
  });

  it('when the finger lets go past half the width, then the page slides off and only then the app goes back as Zpět does', async () => {
    drag(page, [
      { x: 20, y: 300, at: 0 },
      { x: 120, y: 302, at: 200 },
      { x: 230, y: 304, at: 400 },
      { x: 230, y: 304, at: 700 },
    ]);

    expect(preview.settle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ completes: true, to: 390 }),
    );
    expect(backTarget.back).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(backTarget.back).toHaveBeenCalledExactlyOnceWith('/aktuality');
  });

  it('when the finger lets go short of half the width, then the page slides back and the app stays', async () => {
    drag(page, [
      { x: 20, y: 300, at: 0 },
      { x: 90, y: 302, at: 200 },
      { x: 160, y: 304, at: 400 },
      { x: 160, y: 304, at: 700 },
    ]);
    await Promise.resolve();

    expect(preview.settle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ completes: false, to: 0 }),
    );
    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when the page holds unsaved input, then the page slides back first and the step back then asks as Zpět does', async () => {
    dirty = true;

    drag(page, [
      { x: 20, y: 300, at: 0 },
      { x: 120, y: 302, at: 200 },
      { x: 230, y: 304, at: 400 },
      { x: 230, y: 304, at: 700 },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(preview.settle).not.toHaveBeenCalled();
    expect(preview.slideBack).toHaveBeenCalledTimes(1);
    expect(backTarget.back).toHaveBeenCalledExactlyOnceWith('/aktuality');
  });

  it('when the system cancels the touch while the page follows, then the page slides back and the app stays', async () => {
    touch('touchstart', page, { x: 20, y: 300, at: 0 });
    touch('touchmove', page, { x: 300, y: 300, at: 100 });
    touch('touchcancel', page, { x: 300, y: 300, at: 150 });
    await Promise.resolve();

    expect(preview.slideBack).toHaveBeenCalledTimes(1);
    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when the page went back by itself during the swipe, then the page slides back and the app takes no second step', async () => {
    touch('touchstart', page, { x: 20, y: 300, at: 0 });
    touch('touchmove', page, { x: 300, y: 300, at: 100 });
    window.dispatchEvent(new PopStateEvent('popstate'));
    touch('touchend', page, { x: 300, y: 300, at: 110 });
    await Promise.resolve();
    await Promise.resolve();

    expect(preview.slideBack).toHaveBeenCalledTimes(1);
    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when a dialog is open, then no page shows under the finger and the swipe closes the dialog as before', () => {
    openDialog();

    drag(page, ACROSS);

    expect(transitions.startSwipe).not.toHaveBeenCalled();
    expect(location.back).toHaveBeenCalledTimes(1);
  });

  it('when the page is a tab root, then no page shows under the finger', () => {
    chrome.set(chromeWith(null));

    drag(page, ACROSS);

    expect(transitions.startSwipe).not.toHaveBeenCalled();
  });
});

describe('Given nfnn.cz in a tab of Safari on an iPhone, where the swipe is the browser’s', () => {
  beforeEach(() => runOn(IPHONE_SAFARI_TAB));

  it('when a finger lands at the left edge, then the site leaves the touch to Safari', () => {
    const { start } = drag(page, [
      { x: 8, y: 300, at: 0 },
      { x: 400, y: 300, at: 300 },
    ]);

    expect(start.defaultPrevented).toBe(false);
    expect(location.back).not.toHaveBeenCalled();
    expect(backTarget.back).not.toHaveBeenCalled();
  });
});

describe('Given Chrome on Android, whose back gesture belongs to the system', () => {
  beforeEach(() => runOn({ standalone: undefined, maxTouchPoints: 5 }));

  it('when a swipe goes right, then the site leaves it alone', () => {
    const { start } = drag(page, ACROSS);

    expect(start.defaultPrevented).toBe(false);
    expect(location.back).not.toHaveBeenCalled();
    expect(backTarget.back).not.toHaveBeenCalled();
  });
});

describe('Given the site added to the Dock of a Mac, which has no touch screen', () => {
  beforeEach(() => runOn({ standalone: true, maxTouchPoints: 0 }));

  it('when a touch event comes anyway, then nothing listens to it', () => {
    drag(page, ACROSS);

    expect(backTarget.back).not.toHaveBeenCalled();
  });
});

describe('Given the app’s configuration', () => {
  it('when the app starts, then the swipe back is set up', () => {
    expect(appConfig.providers).toContain(edgeSwipeBackAtStart);
  });
});
