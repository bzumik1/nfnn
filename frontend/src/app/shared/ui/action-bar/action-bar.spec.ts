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
  let height: number;
  let bottom: number;

  beforeEach(async () => {
    height = 84;
    bottom = window.innerHeight;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, bottom - height, 320, height),
    );
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--action-bar-height');
  });

  it('when it is shown, then the page knows its height so a focused field scrolls above it', () => {
    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe('84px');
    expect(FakeResizeObserver.latest?.observed).toEqual([
      fixture.nativeElement.querySelector('.ui-action-bar'),
    ]);
  });

  it('when it grows because a message appears, then the page knows the new height', () => {
    height = 132;
    FakeResizeObserver.latest?.callback();

    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe('132px');
  });

  it('when it goes away, then the page forgets it and stops watching', async () => {
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe('');
    expect(FakeResizeObserver.latest?.disconnected).toBe(true);
  });

  function bar(): HTMLElement {
    return fixture.nativeElement.querySelector('.ui-action-bar');
  }

  it('when it stands on the bottom of the screen while the page scrolls under it, then it floats over the page', () => {
    expect(bar().classList).not.toContain('ui-action-bar--resting');
    expect(bar().classList).not.toContain('ui-action-bar--in-flow');
  });

  it('when the page scrolls to where the bar stops above the bottom of the screen, then it rests in the page like a card', async () => {
    bottom = window.innerHeight - 120;
    window.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();

    expect(bar().classList).toContain('ui-action-bar--resting');
  });

  it('when the page scrolls back until the bar reaches the bottom of the screen, then it floats again', async () => {
    bottom = window.innerHeight - 120;
    window.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    bottom = window.innerHeight;
    window.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();

    expect(bar().classList).not.toContain('ui-action-bar--resting');
  });

  it('when it grows taller than a quarter of the screen, then it stays in the page instead of covering the fields and the page reserves no room for it', async () => {
    height = Math.ceil(window.innerHeight / 4) + 1;
    FakeResizeObserver.latest?.callback();
    await fixture.whenStable();

    expect(bar().classList).toContain('ui-action-bar--in-flow');
    expect(bar().classList).toContain('ui-action-bar--resting');
    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe('0px');
  });

  it('when it shrinks back to a quarter of the screen, then it floats again', async () => {
    height = Math.ceil(window.innerHeight / 4) + 1;
    FakeResizeObserver.latest?.callback();
    await fixture.whenStable();
    height = Math.floor(window.innerHeight / 4);
    FakeResizeObserver.latest?.callback();
    await fixture.whenStable();

    expect(bar().classList).not.toContain('ui-action-bar--in-flow');
    expect(document.documentElement.style.getPropertyValue('--action-bar-height')).toBe(
      `${height}px`,
    );
  });
});
