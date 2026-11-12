import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LaunchScreen } from './launch-screen';

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
  let letThrough: () => void;
  let guardAsked: Promise<void>;
  let slowGuard: () => Promise<boolean>;

  beforeEach(() => {
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
          { path: 'rozbita', component: Broken },
        ]),
      ],
    });
    TestBed.inject(LaunchScreen);
  });

  afterEach(() => screen.remove());

  it('when the app has started but no page is drawn yet, then it stays', async () => {
    await RouterTestingHarness.create();

    expect(screen.isConnected).toBe(true);
  });

  it('when the first page is drawn, then it goes', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/stranka');
    TestBed.tick();

    expect(screen.isConnected).toBe(false);
  });

  it('when a guard sends the first navigation elsewhere, then it stays until that page is drawn', async () => {
    const harness = await RouterTestingHarness.create();
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

  it('when the first page cannot open, then it goes so the page can say so', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/rozbita').catch(() => undefined);
    TestBed.tick();

    expect(screen.isConnected).toBe(false);
  });
});
