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

class FakeWindow extends EventTarget {
  width: number;
  rootFontPx: number;
  readonly queries: FakeMediaQueryList[] = [];

  constructor(width: number, rootFontPx = 16) {
    super();
    this.width = width;
    this.rootFontPx = rootFontPx;
  }

  get innerWidth(): number {
    return this.width;
  }

  getComputedStyle(): { fontSize: string } {
    return { fontSize: `${this.rootFontPx}px` };
  }

  matchMedia(media: string): FakeMediaQueryList {
    const query = new FakeMediaQueryList(media, () => this.width);
    this.queries.push(query);
    return query;
  }

  resize(width: number): void {
    this.width = width;
    this.queries.forEach((query) => query.dispatchEvent(new Event('change')));
    this.dispatchEvent(new Event('resize'));
  }

  enlargeText(rootFontPx: number): void {
    this.rootFontPx = rootFontPx;
    this.dispatchEvent(new Event('resize'));
  }
}

function layoutIn(view: object | null): CompactLayout {
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: { defaultView: view, documentElement: {} } }],
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

  it('when the browser cannot answer media queries, then the layout is wide, as today', () => {
    expect(layoutIn({}).isCompact()).toBe(false);
    TestBed.resetTestingModule();
    expect(layoutIn(null).isCompact()).toBe(false);
  });

  describe('when it chooses between list rows and tables', () => {
    it('then a compact window shows rows', () => {
      expect(layoutIn(new FakeWindow(390)).listsAsRows()).toBe(true);
    });

    it('then a wide window at the default text size shows tables', () => {
      expect(layoutIn(new FakeWindow(1194)).listsAsRows()).toBe(false);
    });

    it('then a wide window whose text is twice as large shows rows, as the window is narrower than the nav breakpoint in text widths', () => {
      const layout = layoutIn(new FakeWindow(1194, 32));

      expect(layout.isCompact()).toBe(false);
      expect(layout.listsAsRows()).toBe(true);
    });

    it('then a window just as wide as the nav breakpoint in text widths shows rows, and one pixel wider shows tables', () => {
      expect(layoutIn(new FakeWindow(1798, 32)).listsAsRows()).toBe(true);
      TestBed.resetTestingModule();
      expect(layoutIn(new FakeWindow(1799, 32)).listsAsRows()).toBe(false);
    });

    it('then enlarging the text of an open page switches its tables to rows', () => {
      const view = new FakeWindow(1194);
      const layout = layoutIn(view);

      view.enlargeText(32);

      expect(layout.listsAsRows()).toBe(true);
    });

    it('then a browser that cannot answer media queries shows tables, as today', () => {
      expect(layoutIn({}).listsAsRows()).toBe(false);
    });
  });
});
