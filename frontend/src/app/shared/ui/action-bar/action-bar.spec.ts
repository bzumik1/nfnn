import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActionBar } from './action-bar';

@Component({
  imports: [ActionBar],
  template: `@if (shown()) {
    <div class="ui-action-bar" appActionBar>Uložit</div>
  }`,
})
class Host {
  readonly shown = signal(true);
}

class FakeResizeObserver {
  static latest: FakeResizeObserver | null = null;
  observed: Element[] = [];
  disconnected = false;

  constructor(readonly callback: () => void) {
    FakeResizeObserver.latest = this;
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

describe('Given a sticky action bar at the bottom of a page', () => {
  let fixture: ComponentFixture<Host>;
  let heightOf: (bar: HTMLElement) => number;
  let bottomOf: (bar: HTMLElement) => number;
  let viewportHeight: number;
  let viewportWidth: number;
  let coarsePointer: boolean;

  const third = () => Math.ceil(viewportHeight / 3) + 1;
  const isResting = (bar: HTMLElement) => bar.classList.contains('ui-action-bar--resting');
  const isInFlow = (bar: HTMLElement) => bar.classList.contains('ui-action-bar--in-flow');

  beforeEach(async () => {
    viewportHeight = 768;
    viewportWidth = 375;
    coarsePointer = true;
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({ matches: query === '(pointer: coarse)' && coarsePointer }) as MediaQueryList,
    );
    heightOf = () => 84;
    bottomOf = () => viewportHeight;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => viewportHeight);
    vi.spyOn(window, 'innerWidth', 'get').mockImplementation(() => viewportWidth);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return heightOf(this);
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const height = heightOf(this);
      return new DOMRect(0, bottomOf(this) - height, 320, height);
    });
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--action-bar-height');
  });

  function bar(): HTMLElement {
    return fixture.nativeElement.querySelector('.ui-action-bar');
  }

  async function scroll(times = 1): Promise<void> {
    for (let frame = 0; frame < times; frame++) {
      window.dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
    }
  }

  async function resize(times = 1): Promise<void> {
    for (let frame = 0; frame < times; frame++) {
      FakeResizeObserver.latest?.callback();
      await fixture.whenStable();
    }
  }

  it('when it is shown, then the page knows its height so a focused field scrolls above it', () => {
    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe('84px');
    expect(FakeResizeObserver.latest?.observed).toContain(bar());
  });

  it('when what stands above it changes its size, then the bar looks again where it stands', () => {
    expect(FakeResizeObserver.latest?.observed).toContain(bar().parentElement);
  });

  it('when it grows because a message appears, then the page knows the new height', async () => {
    heightOf = () => 132;
    await resize();

    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe('132px');
  });

  it('when the page scrolls and the height stays the same, then the page height is written only once', async () => {
    const writes = vi.spyOn(document.documentElement.style, 'setProperty');

    await scroll(5);

    expect(writes).not.toHaveBeenCalled();
  });

  it('when it goes away, then the page forgets it, stops watching and stops listening to the window', async () => {
    const removed = vi.spyOn(window, 'removeEventListener');

    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe('');
    expect(FakeResizeObserver.latest?.disconnected).toBe(true);
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['scroll', 'resize']),
    );
  });

  it('when it stands on the bottom of the screen while the page scrolls under it, then it floats over the page', () => {
    expect(isResting(bar())).toBe(false);
    expect(isInFlow(bar())).toBe(false);
  });

  it('when the page scrolls to where the bar stops above the bottom of the screen, then it rests in the page like a card', async () => {
    bottomOf = () => viewportHeight - 120;
    await scroll();

    expect(isResting(bar())).toBe(true);
  });

  it('when the page scrolls back until the bar reaches the bottom of the screen, then it floats again', async () => {
    bottomOf = () => viewportHeight - 120;
    await scroll();
    bottomOf = () => viewportHeight;
    await scroll();

    expect(isResting(bar())).toBe(false);
  });

  it('when the bar stands at the edge where it starts to rest and its own look moves it by a pixel, then it keeps one state over the next frames', async () => {
    bottomOf = (element) => viewportHeight - (isResting(element) ? 1 : 2.5);
    const seen: boolean[] = [];

    for (let frame = 0; frame < 6; frame++) {
      await scroll();
      seen.push(isResting(bar()));
      await resize();
      seen.push(isResting(bar()));
    }

    expect(new Set(seen.slice(1)).size).toBe(1);
  });

  it('when it grows taller than a third of the screen, then it stays in the page instead of covering the fields and the page reserves no room for it', async () => {
    heightOf = () => third();
    await resize();

    expect(isInFlow(bar())).toBe(true);
    expect(isResting(bar())).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe('0px');
  });

  it('when it shrinks well below a third of the screen, then it floats again', async () => {
    heightOf = () => third();
    await resize();
    heightOf = () => Math.floor(viewportHeight * 0.25);
    await resize();

    expect(isInFlow(bar())).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe(
      `${Math.floor(viewportHeight * 0.25)}px`,
    );
  });

  it('when its height in the page differs a little from its floating height at the third of the screen, then it keeps one state over the next frames', async () => {
    heightOf = (element) => (isInFlow(element) ? third() - 6 : third());
    const seen: boolean[] = [];

    for (let frame = 0; frame < 6; frame++) {
      await resize();
      seen.push(isInFlow(bar()));
      await scroll();
      seen.push(isInFlow(bar()));
    }

    expect(seen.every(Boolean)).toBe(true);
  });

  it('when the Safari toolbar shows again and makes the screen shorter, then a bar between the two thirds keeps floating', async () => {
    const tallThird = third();
    viewportHeight = 700;
    heightOf = () => tallThird - 2;
    await scroll(3);

    expect(isInFlow(bar())).toBe(false);
  });

  it('when the administrator pressed inside the floating bar and a save makes it taller than a third of the screen, then it keeps floating under the finger', async () => {
    bar().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    heightOf = () => third();
    await resize();

    expect(isInFlow(bar())).toBe(false);
  });

  it('when a control inside the floating bar has the focus and the bar grows taller than a third of the screen, then it keeps floating', async () => {
    const button = document.createElement('button');
    bar().append(button);
    button.focus();
    heightOf = () => third();
    await resize();

    expect(isInFlow(bar())).toBe(false);
  });

  function pressInside(): void {
    bar().dispatchEvent(new Event('pointerdown', { bubbles: true }));
  }

  function lift(): void {
    window.dispatchEvent(new Event('pointerup'));
  }

  it('when the focus leaves the bar it held, then the bar taller than a third of the screen moves into the page', async () => {
    const button = document.createElement('button');
    bar().append(button);
    button.focus();
    heightOf = () => third();
    await resize();
    const outside = document.createElement('input');
    document.body.append(outside);

    outside.focus();
    await fixture.whenStable();

    expect(isInFlow(bar())).toBe(true);
    outside.remove();
  });

  it('when the focus moves from one control of the bar to another, then the bar keeps floating', async () => {
    const save = document.createElement('button');
    const cancel = document.createElement('button');
    bar().append(save, cancel);
    save.focus();
    heightOf = () => third();
    await resize();

    cancel.focus();
    await resize();

    expect(isInFlow(bar())).toBe(false);
  });

  it('when the administrator presses outside the bar it held, then the bar taller than a third of the screen moves into the page', async () => {
    pressInside();
    lift();
    heightOf = () => third();
    await resize();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await fixture.whenStable();

    expect(isInFlow(bar())).toBe(true);
  });

  it('when the phone turns after a press, then the bar taller than a third of the new screen moves into the page', async () => {
    pressInside();
    lift();
    viewportWidth = 667;
    viewportHeight = 375;
    heightOf = () => 200;

    window.dispatchEvent(new Event('resize'));
    await fixture.whenStable();

    expect(isInFlow(bar())).toBe(true);
  });

  it('when the pressed bar is taller than the screen above its bottom edge, then it is not held afloat', async () => {
    pressInside();
    lift();
    heightOf = () => viewportHeight + 10;

    await resize();

    expect(isInFlow(bar())).toBe(true);
  });

  it('when a bar in the page shrinks below 30 % while a finger is on it, then it stays under the finger until the finger lifts', async () => {
    heightOf = () => third();
    await resize();
    pressInside();
    heightOf = () => Math.floor(viewportHeight * 0.25);

    await resize();
    expect(isInFlow(bar())).toBe(true);

    lift();
    await resize();
    expect(isInFlow(bar())).toBe(false);
  });

  it('when the window gets much shorter without turning, then the limit follows the new height', async () => {
    viewportHeight = 400;
    heightOf = () => 150;

    window.dispatchEvent(new Event('resize'));
    await fixture.whenStable();

    expect(isInFlow(bar())).toBe(true);
  });

  it('when a window on a computer gets a little shorter without changing its width, then the limit follows the new height at once', async () => {
    coarsePointer = false;
    const tallThird = third();
    viewportHeight = 700;
    heightOf = () => tallThird - 2;

    window.dispatchEvent(new Event('resize'));
    await fixture.whenStable();

    expect(isInFlow(bar())).toBe(true);
  });
});
