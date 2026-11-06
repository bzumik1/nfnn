import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../app.config';
import { PressedOnTouch, pressedOnTouchAtStart } from './pressed-on-touch';

describe("Given the page on an iPhone or iPad, whose Safari shows a control's pressed state only while the document listens to touches", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [pressedOnTouchAtStart] });
  });

  afterEach(() => {
    TestBed.inject(PressedOnTouch).stop();
    vi.restoreAllMocks();
  });

  it('when the app starts, then the document listens to every touch without ever waiting on it, so scrolling stays smooth', () => {
    const listen = vi.spyOn(document, 'addEventListener');

    TestBed.inject(PressedOnTouch).start();

    expect(listen).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true });
  });

  it('when a finger touches the page, then nothing of the touch is cancelled', () => {
    TestBed.inject(PressedOnTouch).start();
    const touch = new Event('touchstart', { bubbles: true, cancelable: true });

    document.body.dispatchEvent(touch);

    expect(touch.defaultPrevented).toBe(false);
  });

  it('when it is stopped, then the document no longer listens to touches', () => {
    const forget = vi.spyOn(document, 'removeEventListener');
    const feedback = TestBed.inject(PressedOnTouch);
    feedback.start();

    feedback.stop();

    expect(forget).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true });
  });
});

describe('Given the start of the app', () => {
  it('when it starts, then controls show their pressed state on touch from the first page', () => {
    expect(appConfig.providers).toContain(pressedOnTouchAtStart);
  });
});
