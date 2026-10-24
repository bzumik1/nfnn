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

  beforeEach(async () => {
    height = 84;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
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
});
