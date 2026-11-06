import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../app.config';
import { WINDOW_CONTROLS_CLASS, WindowControls, windowControlsAtStart } from './window-controls';

const IPAD_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const IPHONE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Device {
  readonly standalone: boolean | undefined;
  readonly maxTouchPoints: number;
  readonly userAgent: string;
  readonly screen: Size;
  readonly window: Size;
}

const IPAD_SCREEN: Size = { width: 820, height: 1180 };

const ipadApp = (window: Size): Device => ({
  standalone: true,
  maxTouchPoints: 5,
  userAgent: IPAD_USER_AGENT,
  screen: IPAD_SCREEN,
  window,
});

function stub(target: object, name: string, value: () => unknown): void {
  Object.defineProperty(target, name, { configurable: true, get: value });
}

let current: Device;

function resizeTo(window: Size): void {
  current = { ...current, window };
  globalThis.dispatchEvent(new Event('resize'));
}

function runOn(device: Device): void {
  current = device;
  stub(navigator, 'standalone', () => current.standalone);
  stub(navigator, 'maxTouchPoints', () => current.maxTouchPoints);
  stub(navigator, 'userAgent', () => current.userAgent);
  stub(screen, 'width', () => current.screen.width);
  stub(screen, 'height', () => current.screen.height);
  stub(globalThis, 'outerWidth', () => current.window.width);
  stub(globalThis, 'outerHeight', () => current.window.height);
  TestBed.configureTestingModule({ providers: [windowControlsAtStart] });
  TestBed.inject(WindowControls);
}

function keepsRoomForWindowControls(): boolean {
  return document.documentElement.classList.contains(WINDOW_CONTROLS_CLASS);
}

afterEach(() => {
  for (const name of ['standalone', 'maxTouchPoints', 'userAgent']) {
    delete (navigator as unknown as Record<string, unknown>)[name];
  }
  for (const name of ['width', 'height']) {
    delete (screen as unknown as Record<string, unknown>)[name];
  }
  for (const name of ['outerWidth', 'outerHeight']) {
    delete (globalThis as unknown as Record<string, unknown>)[name];
  }
  document.documentElement.classList.remove(WINDOW_CONTROLS_CLASS);
});

describe('Given the app opened from the home screen of an iPad, in a window smaller than the screen', () => {
  it('when it starts, then the page keeps room for the window controls at its top-leading corner', () => {
    runOn(ipadApp({ width: 375, height: 652 }));

    expect(keepsRoomForWindowControls()).toBe(true);
  });

  describe('when the window is maximized', () => {
    it('then the room goes, because a full-screen window shows no controls over the page', () => {
      runOn(ipadApp({ width: 375, height: 652 }));

      resizeTo(IPAD_SCREEN);

      expect(keepsRoomForWindowControls()).toBe(false);
    });
  });
});

describe('Given the app opened from the home screen of an iPad in a maximized window', () => {
  it('when it starts, then the page keeps its usual layout', () => {
    runOn(ipadApp(IPAD_SCREEN));

    expect(keepsRoomForWindowControls()).toBe(false);
  });

  describe('when the window is made smaller than the screen', () => {
    it('then the page keeps room for the window controls', () => {
      runOn(ipadApp(IPAD_SCREEN));

      resizeTo({ width: 540, height: 880 });

      expect(keepsRoomForWindowControls()).toBe(true);
    });
  });

  describe('when the iPad turns on its side', () => {
    it('then the page keeps its usual layout, whichever way the screen reports its sides', () => {
      runOn(ipadApp(IPAD_SCREEN));

      resizeTo({ width: 1180, height: 820 });

      expect(keepsRoomForWindowControls()).toBe(false);
    });
  });
});

describe('Given the app opened from the home screen of an iPhone, which has no window controls', () => {
  it('when its window is smaller than the screen, then the page keeps its usual layout', () => {
    runOn({
      standalone: true,
      maxTouchPoints: 5,
      userAgent: IPHONE_USER_AGENT,
      screen: { width: 402, height: 874 },
      window: { width: 402, height: 800 },
    });

    expect(keepsRoomForWindowControls()).toBe(false);
  });
});

describe('Given the site in a Safari window on an iPad, whose own toolbar holds the controls', () => {
  it('when it starts, then the page keeps its usual layout', () => {
    runOn({ ...ipadApp({ width: 375, height: 652 }), standalone: false });

    expect(keepsRoomForWindowControls()).toBe(false);
  });
});

describe('Given the site added to the Dock of a Mac, whose window has a title bar of its own', () => {
  it('when it starts, then the page keeps its usual layout', () => {
    runOn({ ...ipadApp({ width: 900, height: 700 }), maxTouchPoints: 0 });

    expect(keepsRoomForWindowControls()).toBe(false);
  });
});

describe('Given the start of the app', () => {
  it('when it starts, then the room for the window controls is chosen before the first page shows', () => {
    expect(appConfig.providers).toContain(windowControlsAtStart);
  });
});
