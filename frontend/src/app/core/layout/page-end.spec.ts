import { PagePlacement } from '../navigation/page-placement';
import { ScrollHold } from '../navigation/scroll-hold';
import { keepThePageEnd, ScrolledView } from './page-end';

interface Reader extends ScrolledView {
  readonly scrolls: ScrollToOptions[];
  grow(by: number): void;
}

interface Screen {
  readonly innerHeight?: number;
  readonly shownHeight?: number;
  readonly shownOffset?: number;
}

const NOTHING_HELD = { holding: false };
const NOTHING_SETTLING = { settling: false };

function readerAt(scrollY: number, scrollHeight: number, screen: Screen = {}): Reader {
  const { innerHeight = 800, shownHeight = innerHeight, shownOffset = 0 } = screen;
  const page = { scrollHeight };
  const scrolls: ScrollToOptions[] = [];
  return {
    scrollY,
    innerHeight,
    visualViewport: { pageTop: scrollY + shownOffset, height: shownHeight },
    document: { documentElement: page },
    scrolls,
    scrollTo: (options: ScrollToOptions) => scrolls.push(options),
    grow: (by: number) => (page.scrollHeight += by),
  };
}

describe('Given a page whose bottom room grows when a bar appears at the bottom of the screen', () => {
  it('when the reader stands at the end of the page, then the page scrolls to its new end at once', () => {
    const reader = readerAt(1200, 2000);

    keepThePageEnd(reader, NOTHING_HELD, NOTHING_SETTLING, () => reader.grow(96));

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when the reader stands within two pixels of the end, then the page still keeps its end in view', () => {
    const reader = readerAt(1198, 2000);

    keepThePageEnd(reader, NOTHING_HELD, NOTHING_SETTLING, () => reader.grow(96));

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when the reader stands three pixels above the end, then the page does not move', () => {
    const reader = readerAt(1197, 2000);

    keepThePageEnd(reader, NOTHING_HELD, NOTHING_SETTLING, () => reader.grow(96));

    expect(reader.scrolls).toEqual([]);
  });

  it('when the keyboard narrows the visual viewport and the reader stands above the end, then the page does not move', () => {
    const reader = readerAt(1200, 2000, { shownHeight: 500 });

    keepThePageEnd(reader, NOTHING_HELD, NOTHING_SETTLING, () => reader.grow(96));

    expect(reader.scrolls).toEqual([]);
  });

  it('when the keyboard shifts the narrowed visual viewport down to the end of the page, then the page keeps its end in view', () => {
    const reader = readerAt(1200, 2000, { shownHeight: 500, shownOffset: 300 });

    keepThePageEnd(reader, NOTHING_HELD, NOTHING_SETTLING, () => reader.grow(96));

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when the browser has no visual viewport, then the end is measured by the scroll and the window height', () => {
    const reader = { ...readerAt(1200, 2000), visualViewport: null };

    keepThePageEnd(reader, NOTHING_HELD, NOTHING_SETTLING, () => reader.grow(96));

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when a page transition holds the scroll, then the room grows and the page does not move', () => {
    const reader = readerAt(1200, 2000);
    let grown = false;

    keepThePageEnd(reader, { holding: true }, NOTHING_SETTLING, () => (grown = true));

    expect(grown).toBe(true);
    expect(reader.scrolls).toEqual([]);
  });

  it('when Zpět still restores the place of the page, then the page does not move', () => {
    const reader = readerAt(1200, 2000);

    keepThePageEnd(reader, NOTHING_HELD, { settling: true }, () => reader.grow(96));

    expect(reader.scrolls).toEqual([]);
  });

  it('when the reader reads further up the page, then the page does not move', () => {
    const reader = readerAt(600, 2000);

    keepThePageEnd(reader, NOTHING_HELD, NOTHING_SETTLING, () => reader.grow(96));

    expect(reader.scrolls).toEqual([]);
  });

  it('when the page has not been scrolled at all, then it stays at its top', () => {
    const reader = readerAt(0, 800);

    keepThePageEnd(reader, NOTHING_HELD, NOTHING_SETTLING, () => reader.grow(96));

    expect(reader.scrolls).toEqual([]);
  });

  it('when there is no window, then the room still grows', () => {
    let grown = false;

    keepThePageEnd(null, NOTHING_HELD, NOTHING_SETTLING, () => (grown = true));

    expect(grown).toBe(true);
  });
});

describe('Given a reader at the end of a page whose place the app itself may still be keeping', () => {
  let placement: PagePlacement;
  let scrollHold: ScrollHold;

  beforeEach(() => {
    placement = new PagePlacement();
    scrollHold = new ScrollHold();
  });

  it('when a step back is still putting the page where it was left, then a bar arriving does not move the page', () => {
    const reader = readerAt(1200, 2000);
    placement.pending();

    keepThePageEnd(reader, scrollHold, placement, () => reader.grow(96));

    expect(reader.scrolls).toEqual([]);
  });

  it('when the page has been put where it was left, then the next bar moves the page to its new end', () => {
    const reader = readerAt(1200, 2000);
    const placed = placement.pending();
    keepThePageEnd(reader, scrollHold, placement, () => reader.grow(96));

    placed();
    const afterPlaced = readerAt(1200, 2000);
    keepThePageEnd(afterPlaced, scrollHold, placement, () => afterPlaced.grow(80));

    expect(reader.scrolls).toEqual([]);
    expect(afterPlaced.scrolls).toEqual([{ top: 2080, behavior: 'instant' }]);
  });

  it('when a page transition holds the scroll, then a bar arriving does not move the page until the scroll is let go', () => {
    const reader = readerAt(1200, 2000);
    scrollHold.hold();

    keepThePageEnd(reader, scrollHold, placement, () => reader.grow(96));
    scrollHold.release();
    const afterRelease = readerAt(1200, 2000);
    keepThePageEnd(afterRelease, scrollHold, placement, () => afterRelease.grow(80));

    expect(reader.scrolls).toEqual([]);
    expect(afterRelease.scrolls).toEqual([{ top: 2080, behavior: 'instant' }]);
  });
});
