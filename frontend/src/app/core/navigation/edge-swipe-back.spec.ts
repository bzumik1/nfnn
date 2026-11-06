import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { appConfig } from '../../app.config';
import { BackTarget } from './back-target';
import { EdgeSwipeBack, edgeSwipeBackAtStart } from './edge-swipe-back';
import { Chrome, RouteChrome } from './route-chrome';

interface Device {
  readonly standalone: boolean | undefined;
  readonly maxTouchPoints: number;
  readonly gestureEvents: boolean;
}

interface Point {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

const IPHONE_HOME_SCREEN: Device = { standalone: true, maxTouchPoints: 5, gestureEvents: true };
const IPHONE_SAFARI_TAB: Device = { standalone: false, maxTouchPoints: 5, gestureEvents: true };

let location: { back: ReturnType<typeof vi.fn> };
let backTarget: { canGoBack: boolean; back: ReturnType<typeof vi.fn> };
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
    logoBesideBack: true,
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
  if (device.gestureEvents) {
    Object.defineProperty(window, 'GestureEvent', { configurable: true, value: class {} });
  }
  TestBed.configureTestingModule({
    providers: [
      edgeSwipeBackAtStart,
      { provide: Location, useValue: location },
      { provide: BackTarget, useValue: backTarget },
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
  { x: 6, y: 300, at: 0 },
  { x: 400, y: 300, at: 300 },
];

beforeEach(() => {
  location = { back: vi.fn() };
  backTarget = { canGoBack: true, back: vi.fn() };
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
  delete (window as { GestureEvent?: unknown }).GestureEvent;
});

describe('Given the app opened from the home screen of an iPhone', () => {
  beforeEach(() => runOn(IPHONE_HOME_SCREEN));

  it('when a finger lands at the left edge, then Safari gets no swipe to slide the page with', () => {
    const start = touch('touchstart', page, { x: 8, y: 300, at: 0 });

    expect(start.defaultPrevented).toBe(true);
  });

  it('when a finger lands away from the edge, then the page scrolls and taps as always', () => {
    const start = touch('touchstart', page, { x: 120, y: 300, at: 0 });

    expect(start.defaultPrevented).toBe(false);
  });

  it('when a swipe from the left edge goes a third of the screen across, then the app goes back as Zpět does', () => {
    drag(page, [
      { x: 6, y: 300, at: 0 },
      { x: 150, y: 305, at: 200 },
      { x: 400, y: 310, at: 400 },
    ]);

    expect(backTarget.back).toHaveBeenCalledExactlyOnceWith('/aktuality');
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a short quick flick leaves the left edge, then the app goes back as Zpět does', () => {
    drag(page, [
      { x: 4, y: 300, at: 0 },
      { x: 64, y: 302, at: 80 },
    ]);

    expect(backTarget.back).toHaveBeenCalledExactlyOnceWith('/aktuality');
  });

  it('when a short swipe was quick but the finger rested before letting go, then nothing happens', () => {
    drag(page, [
      { x: 4, y: 300, at: 0 },
      { x: 64, y: 302, at: 40 },
      { x: 64, y: 302, at: 600 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();

    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a swipe from the edge stops short and slow, then nothing happens', () => {
    drag(page, [
      { x: 4, y: 300, at: 0 },
      { x: 70, y: 302, at: 900 },
    ]);

    expect(location.back).not.toHaveBeenCalled();
    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when the finger goes far across and comes back towards the edge before letting go, then the swipe is called off', () => {
    drag(page, [
      { x: 6, y: 300, at: 0 },
      { x: 500, y: 300, at: 150 },
      { x: 420, y: 300, at: 250 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();

    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a finger at the edge moves up or down, then it is no swipe back', () => {
    drag(page, [
      { x: 6, y: 300, at: 0 },
      { x: 20, y: 380, at: 100 },
      { x: 400, y: 420, at: 200 },
    ]);

    expect(backTarget.back).not.toHaveBeenCalled();

    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a second finger joins, then it is no swipe back', () => {
    touch('touchstart', page, { x: 6, y: 300, at: 0 }, 2);
    touch('touchmove', page, { x: 400, y: 300, at: 100 });
    touch('touchend', page, { x: 400, y: 300, at: 200 });

    expect(backTarget.back).not.toHaveBeenCalled();

    expect(location.back).not.toHaveBeenCalled();
  });

  it('when the system cancels the touch, then it is no swipe back', () => {
    touch('touchstart', page, { x: 6, y: 300, at: 0 });
    touch('touchmove', page, { x: 400, y: 300, at: 100 });
    touch('touchcancel', page, { x: 400, y: 300, at: 150 });
    touch('touchend', page, { x: 400, y: 300, at: 200 });

    expect(backTarget.back).not.toHaveBeenCalled();

    expect(location.back).not.toHaveBeenCalled();
  });

  it('when Safari went back on its own during the swipe, then the app takes no second step', () => {
    touch('touchstart', page, { x: 6, y: 300, at: 0 });
    touch('touchmove', page, { x: 400, y: 300, at: 100 });
    window.dispatchEvent(new PopStateEvent('popstate'));
    touch('touchend', page, { x: 400, y: 300, at: 200 });

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when the edge is tapped on a button, then the button gets exactly one click', () => {
    const button = page.querySelector('button') as HTMLButtonElement;
    const clicks: MouseEvent[] = [];
    button.addEventListener('click', (event) => clicks.push(event));

    const { end } = drag(button, [
      { x: 6, y: 300, at: 0 },
      { x: 8, y: 302, at: 90 },
    ]);

    expect(clicks.map((click) => [click.clientX, click.clientY, click.detail])).toEqual([
      [8, 302, 1],
    ]);
    expect(end.defaultPrevented).toBe(true);
    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when the edge is pressed and held on a button, then it is no tap', () => {
    const button = page.querySelector('button') as HTMLButtonElement;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    drag(button, [
      { x: 6, y: 300, at: 0 },
      { x: 6, y: 300, at: 800 },
    ]);

    expect(clicked).not.toHaveBeenCalled();
  });

  it('when a field at the edge is touched, then the field keeps the touch for the caret and the keyboard', () => {
    const field = page.querySelector('input') as HTMLInputElement;

    const start = touch('touchstart', field, { x: 6, y: 300, at: 0 });

    expect(start.defaultPrevented).toBe(false);
  });

  describe('when a part of the page handles its own touches, as the zoomed photo does', () => {
    let stage: HTMLElement;

    beforeEach(() => {
      stage = document.createElement('div');
      stage.style.touchAction = 'none';
      page.append(stage);
    });

    it('and a finger pans from the edge, then Safari gets no swipe and the app does not go back', () => {
      const { start } = drag(stage, ACROSS);

      expect(start.defaultPrevented).toBe(true);
      expect(backTarget.back).not.toHaveBeenCalled();
      expect(location.back).not.toHaveBeenCalled();
    });

    it('and the edge is tapped there, then it still gets its click', () => {
      const clicked = vi.fn();
      stage.addEventListener('click', clicked);

      drag(stage, [
        { x: 6, y: 300, at: 0 },
        { x: 7, y: 300, at: 80 },
      ]);

      expect(clicked).toHaveBeenCalledTimes(1);
    });
  });

  it('when the page is a tab root, then a swipe from the edge does nothing, even with pages behind', () => {
    chrome.set(chromeWith(null));

    drag(page, ACROSS);

    expect(backTarget.back).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
  });

  it('when a dialog is open, then a swipe from the edge steps back in its history, which closes it or its last step', () => {
    const dialog = openDialog();

    drag(dialog, ACROSS);

    expect(location.back).toHaveBeenCalledTimes(1);
    expect(backTarget.back).not.toHaveBeenCalled();
  });

  it('when a dialog asks before a navigation leaves the page, then a swipe from the edge dismisses it as Esc does', () => {
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

describe('Given nfnn.cz in a tab of Safari on an iPhone', () => {
  beforeEach(() => runOn(IPHONE_SAFARI_TAB));

  it('when a finger lands at the left edge, then Safari gets no swipe to slide the page with', () => {
    const start = touch('touchstart', page, { x: 8, y: 300, at: 0 });

    expect(start.defaultPrevented).toBe(true);
  });

  it('when a swipe comes from the left edge, then the site goes one step back', () => {
    drag(page, ACROSS);

    expect(location.back).toHaveBeenCalledTimes(1);
  });

  it('when the page has nothing of the site behind it, then a swipe from the edge is the browser’s back, which may leave the site', () => {
    backTarget.canGoBack = false;

    drag(page, ACROSS);

    expect(location.back).toHaveBeenCalledTimes(1);
    expect(backTarget.back).not.toHaveBeenCalled();
  });
});

describe('Given Chrome on Android, whose back gesture belongs to the system', () => {
  beforeEach(() => runOn({ standalone: undefined, maxTouchPoints: 5, gestureEvents: false }));

  it('when a swipe comes from the left edge, then the site leaves it alone', () => {
    const { start } = drag(page, ACROSS);

    expect(start.defaultPrevented).toBe(false);
    expect(location.back).not.toHaveBeenCalled();
  });
});

describe('Given the site added to the Dock of a Mac, which has no touch screen', () => {
  beforeEach(() => runOn({ standalone: true, maxTouchPoints: 0, gestureEvents: true }));

  it('when a touch event comes anyway, then nothing listens to it', () => {
    const start = touch('touchstart', page, { x: 6, y: 300, at: 0 });

    expect(start.defaultPrevented).toBe(false);
  });
});

describe('Given the app’s configuration', () => {
  it('when the app starts, then the edge swipe is set up', () => {
    expect(appConfig.providers).toContain(edgeSwipeBackAtStart);
  });
});
