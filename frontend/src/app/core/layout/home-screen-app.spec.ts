import { TestBed } from '@angular/core/testing';

import { HomeScreenApp } from './home-screen-app';

function openedOn(standalone: boolean | undefined, maxTouchPoints: number): HomeScreenApp {
  Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => standalone });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    get: () => maxTouchPoints,
  });
  return TestBed.inject(HomeScreenApp);
}

afterEach(() => {
  delete (navigator as { standalone?: boolean }).standalone;
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
});

describe('Given the site', () => {
  it('when it runs as the app opened from the home screen of an iPhone or iPad, then it knows it is that app', () => {
    expect(openedOn(true, 5).onTouchScreen).toBe(true);
  });

  it('when it runs in a tab of Safari on an iPhone, then it is no home-screen app', () => {
    expect(openedOn(false, 5).onTouchScreen).toBe(false);
  });

  it('when it runs from the Dock of a Mac, which has no touch screen, then it is no home-screen app', () => {
    expect(openedOn(true, 0).onTouchScreen).toBe(false);
  });

  it('when the browser knows no home screen at all, then it is no home-screen app', () => {
    expect(openedOn(undefined, 5).onTouchScreen).toBe(false);
  });
});
