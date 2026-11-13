import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LAUNCH_SCREEN_LONGEST_MS, LaunchScreen } from './launch-screen';

@Component({ template: '<h1>Stránka</h1>' })
class Page {}

@Component({ template: '' })
class Broken {
  constructor() {
    throw new Error('broken page');
  }
}

describe('Given the launch screen the page painted before the app started', () => {
  let screen: HTMLElement;
  let harness: RouterTestingHarness;
  let letThrough: () => void;
  let guardAsked: Promise<void>;
  let slowGuard: () => Promise<boolean>;

  beforeEach(async () => {
    let asked: () => void = () => undefined;
    guardAsked = new Promise((resolve) => (asked = resolve));
    const passed = new Promise<boolean>((resolve) => (letThrough = () => resolve(true)));
    slowGuard = () => {
      asked();
      return passed;
    };
    screen = document.createElement('div');
    screen.className = 'launch-screen';
    document.body.appendChild(screen);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'stranka', component: Page },
          {
            path: 'aplikace',
            canActivate: [() => inject(Router).parseUrl('/pomala')],
            children: [],
          },
          { path: 'pomala', canActivate: [() => slowGuard()], component: Page },
          { path: 'take-pomala', canActivate: [() => slowGuard()], component: Page },
          { path: 'zavrena', canActivate: [() => false], component: Page },
          { path: 'rozbita', component: Broken },
        ]),
      ],
    });
    TestBed.inject(LaunchScreen);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    vi.useRealTimers();
    screen.remove();
  });

  it('when the first page is still on its way, then it stays', async () => {
    void harness.navigateByUrl('/pomala');
    await guardAsked;
    TestBed.tick();

    expect(screen.isConnected).toBe(true);
    letThrough();
  });

  it('when the first page is drawn, then it goes only after the render that draws it', async () => {
    let atNavigationEnd: boolean | null = null;
    TestBed.inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        atNavigationEnd = screen.isConnected;
      }
    });

    await harness.navigateByUrl('/stranka');
    TestBed.tick();

    expect(atNavigationEnd).toBe(true);
    expect(screen.isConnected).toBe(false);
  });

  it('when a guard sends the first navigation elsewhere, then it stays until that page is drawn', async () => {
    const opened = harness.navigateByUrl('/aplikace');
    await guardAsked;
    TestBed.tick();

    expect(screen.isConnected).toBe(true);

    letThrough();
    await opened;
    TestBed.tick();

    expect(TestBed.inject(Router).url).toBe('/pomala');
    expect(screen.isConnected).toBe(false);
  });

  it('when a new navigation takes the place of the first one, then it stays for the new one', async () => {
    void harness.navigateByUrl('/pomala');
    await guardAsked;
    const replaced = harness.navigateByUrl('/take-pomala');
    TestBed.tick();

    expect(screen.isConnected).toBe(true);

    letThrough();
    await replaced;
    TestBed.tick();

    expect(screen.isConnected).toBe(false);
  });

  it('when a guard turns the first page down, then it goes', async () => {
    await harness.navigateByUrl('/zavrena');
    TestBed.tick();

    expect(screen.isConnected).toBe(false);
  });

  it('when the first page cannot open, then it goes so the page can say so', async () => {
    await harness.navigateByUrl('/rozbita').catch(() => undefined);
    TestBed.tick();

    expect(screen.isConnected).toBe(false);
  });

  it('when the first page never arrives, then it goes after the longest wait, so it never hides the app for good', async () => {
    vi.useFakeTimers();
    void harness.navigateByUrl('/pomala');
    await vi.advanceTimersByTimeAsync(LAUNCH_SCREEN_LONGEST_MS - 1);

    expect(screen.isConnected).toBe(true);

    await vi.advanceTimersByTimeAsync(1);

    expect(screen.isConnected).toBe(false);
    letThrough();
  });
});
