import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { ShortViewport } from './short-viewport';

class FakeMediaQueryList extends EventTarget {
  constructor(
    readonly media: string,
    private readonly height: () => number,
  ) {
    super();
  }

  get matches(): boolean {
    const limit = /^\(max-height: (\d+)px\)$/.exec(this.media);
    return limit !== null && this.height() <= Number(limit[1]);
  }
}

class FakeWindow {
  readonly queries: FakeMediaQueryList[] = [];

  constructor(public height: number) {}

  matchMedia(media: string): FakeMediaQueryList {
    const query = new FakeMediaQueryList(media, () => this.height);
    this.queries.push(query);
    return query;
  }

  turn(height: number): void {
    this.height = height;
    this.queries.forEach((query) => query.dispatchEvent(new Event('change')));
  }
}

function viewportIn(view: object | null): ShortViewport {
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: { defaultView: view } }],
  });
  return TestBed.inject(ShortViewport);
}

describe('Given the height of the window', () => {
  it('when a phone lies on its side, as tall as the short breakpoint, then the window is short', () => {
    expect(viewportIn(new FakeWindow(500)).isShort()).toBe(true);
  });

  it('when the window is one pixel taller than the short breakpoint, then it is not short', () => {
    expect(viewportIn(new FakeWindow(501)).isShort()).toBe(false);
  });

  it('when it asks the browser, then it asks for the height of the short breakpoint, as bp.height-down(short) does', () => {
    const view = new FakeWindow(844);

    viewportIn(view);

    expect(view.queries.map((query) => query.media)).toEqual(['(max-height: 500px)']);
  });

  it('when the phone turns on its side and back upright, then the answer follows', () => {
    const view = new FakeWindow(844);
    const viewport = viewportIn(view);

    view.turn(390);
    const onItsSide = viewport.isShort();
    view.turn(844);

    expect(onItsSide).toBe(true);
    expect(viewport.isShort()).toBe(false);
  });

  it('when the browser cannot answer media queries, then the window is not short', () => {
    expect(viewportIn({}).isShort()).toBe(false);
    TestBed.resetTestingModule();
    expect(viewportIn(null).isShort()).toBe(false);
  });
});
