import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../app.config';
import { PagePinchLock, pagePinchLockAtStart } from './page-pinch-lock';

function gesture(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

describe('Given the page on an iPhone or iPad, whose Safari ignores the viewport limit on zoom', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [pagePinchLockAtStart] });
    TestBed.inject(PagePinchLock);
  });

  afterEach(() => TestBed.inject(PagePinchLock).stop());

  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    it(`when Safari reports a pinch as ${type}, then the page cancels it, so the whole page never zooms`, () => {
      expect(gesture(type).defaultPrevented).toBe(true);
    });
  }

  it('when a finger only scrolls or taps, then nothing of it is cancelled', () => {
    const scroll = new Event('touchmove', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(scroll);

    expect(scroll.defaultPrevented).toBe(false);
  });

  it('when the lock is started twice, then a pinch is still cancelled once and nothing breaks', () => {
    TestBed.inject(PagePinchLock).start();

    expect(gesture('gesturestart').defaultPrevented).toBe(true);
  });
});

describe('Given the start of the app', () => {
  it('when it starts, then the pinch lock is installed before the first page shows', () => {
    expect(appConfig.providers).toContain(pagePinchLockAtStart);
  });
});
