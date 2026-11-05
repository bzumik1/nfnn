import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { CompactLayout } from './compact-layout';

class FakeMediaQueryList extends EventTarget {
  constructor(
    readonly media: string,
    private readonly width: () => number,
  ) {
    super();
  }

  get matches(): boolean {
    const limit = /^\(max-width: (\d+)px\)$/.exec(this.media);
    return limit !== null && this.width() <= Number(limit[1]);
  }
}

class FakeWindow {
  width: number;
  readonly queries: FakeMediaQueryList[] = [];

  constructor(width: number) {
    this.width = width;
  }

  get innerWidth(): number {
    return this.width;
  }

  matchMedia(media: string): FakeMediaQueryList {
    const query = new FakeMediaQueryList(media, () => this.width);
    this.queries.push(query);
    return query;
  }

  resize(width: number): void {
    this.width = width;
    this.queries.forEach((query) => query.dispatchEvent(new Event('change')));
  }
}

function layoutIn(view: object | null): CompactLayout {
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: { defaultView: view } }],
  });
  return TestBed.inject(CompactLayout);
}

describe('Given the compact layout of the app', () => {
  it('when the window is as wide as the nav breakpoint, then the layout is compact', () => {
    expect(layoutIn(new FakeWindow(899)).isCompact()).toBe(true);
  });

  it('when the window is one pixel wider than the nav breakpoint, then the layout is wide', () => {
    expect(layoutIn(new FakeWindow(900)).isCompact()).toBe(false);
  });

  it('when it asks the browser, then it asks for the width of the nav breakpoint, as bp.down(nav) does', () => {
    const view = new FakeWindow(1280);

    layoutIn(view);

    expect(view.queries.map((query) => query.media)).toEqual(['(max-width: 899px)']);
  });

  it('when the window narrows to a phone and widens again, then the layout follows', () => {
    const view = new FakeWindow(1280);
    const layout = layoutIn(view);

    view.resize(390);
    const onPhone = layout.isCompact();
    view.resize(1280);

    expect(onPhone).toBe(true);
    expect(layout.isCompact()).toBe(false);
  });

  it('when the window has no width for a moment, as Chromium reports while it captures a page beyond its viewport, then the layout stays as it was', () => {
    const view = new FakeWindow(1280);
    const layout = layoutIn(view);

    view.resize(1);
    const withoutWidth = layout.isCompact();
    view.resize(1280);

    expect(withoutWidth).toBe(false);
    expect(layout.isCompact()).toBe(false);
  });

  it('when the browser cannot answer media queries, then the layout is wide, as today', () => {
    expect(layoutIn({}).isCompact()).toBe(false);
    TestBed.resetTestingModule();
    expect(layoutIn(null).isCompact()).toBe(false);
  });
});
