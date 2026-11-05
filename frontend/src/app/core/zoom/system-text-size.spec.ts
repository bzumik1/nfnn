import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../app.config';
import { SYSTEM_TEXT_SIZE_CLASS, SystemTextSize, systemTextSizeAtStart } from './system-text-size';

interface Device {
  readonly standalone: boolean | undefined;
  readonly maxTouchPoints: number;
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
  TestBed.configureTestingModule({ providers: [systemTextSizeAtStart] });
  TestBed.inject(SystemTextSize);
}

function followsSystemTextSize(): boolean {
  return document.documentElement.classList.contains(SYSTEM_TEXT_SIZE_CLASS);
}

afterEach(() => {
  delete (navigator as { standalone?: boolean }).standalone;
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
  document.documentElement.classList.remove(SYSTEM_TEXT_SIZE_CLASS);
});

describe('Given the app opened from the home screen of an iPhone or iPad, which has no aA menu', () => {
  it('when it starts, then the page takes its text size from the system setting', () => {
    runOn({ standalone: true, maxTouchPoints: 5 });

    expect(followsSystemTextSize()).toBe(true);
  });
});

describe('Given the site in a tab of Safari on an iPhone, where aA sets the text size', () => {
  it('when it starts, then the text size stays the browser’s', () => {
    runOn({ standalone: false, maxTouchPoints: 5 });

    expect(followsSystemTextSize()).toBe(false);
  });
});

describe('Given the site added to the Dock of a Mac, which has no touch screen', () => {
  it('when it starts, then the text size stays the browser’s', () => {
    runOn({ standalone: true, maxTouchPoints: 0 });

    expect(followsSystemTextSize()).toBe(false);
  });
});

describe('Given any other browser or installed app, which knows no home-screen flag', () => {
  it('when it starts, then the text size stays the browser’s', () => {
    runOn({ standalone: undefined, maxTouchPoints: 5 });

    expect(followsSystemTextSize()).toBe(false);
  });
});

describe('Given the start of the app', () => {
  it('when it starts, then the text size is chosen before the first page shows', () => {
    expect(appConfig.providers).toContain(systemTextSizeAtStart);
  });
});
