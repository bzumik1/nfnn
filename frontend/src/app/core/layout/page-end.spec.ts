import { keepThePageEnd, ScrolledView } from './page-end';

interface Reader extends ScrolledView {
  readonly scrolls: ScrollToOptions[];
  grow(by: number): void;
}

const NOTHING_HELD = { holding: false };
const NOTHING_RESTORED = () => false;

function readerAt(
  scrollY: number,
  scrollHeight: number,
  innerHeight = 800,
  shownHeight = innerHeight,
): Reader {
  const page = { scrollHeight };
  const scrolls: ScrollToOptions[] = [];
  return {
    scrollY,
    innerHeight,
    visualViewport: { height: shownHeight },
    document: { documentElement: page },
    scrolls,
    scrollTo: (options: ScrollToOptions) => scrolls.push(options),
    grow: (by: number) => (page.scrollHeight += by),
  };
}

describe('Given a page whose bottom room grows when a bar appears at the bottom of the screen', () => {
  it('when the reader stands at the end of the page, then the page scrolls to its new end at once', () => {
    const reader = readerAt(1200, 2000);

    keepThePageEnd(reader, NOTHING_HELD, () => reader.grow(96), NOTHING_RESTORED);

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when the reader stands within two pixels of the end, then the page still keeps its end in view', () => {
    const reader = readerAt(1198, 2000);

    keepThePageEnd(reader, NOTHING_HELD, () => reader.grow(96), NOTHING_RESTORED);

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when the reader stands three pixels above the end, then the page does not move', () => {
    const reader = readerAt(1197, 2000);

    keepThePageEnd(reader, NOTHING_HELD, () => reader.grow(96), NOTHING_RESTORED);

    expect(reader.scrolls).toEqual([]);
  });

  it('when the keyboard narrows the visual viewport and the reader stands above the end, then the page does not move', () => {
    const reader = readerAt(1200, 2000, 800, 500);

    keepThePageEnd(reader, NOTHING_HELD, () => reader.grow(96), NOTHING_RESTORED);

    expect(reader.scrolls).toEqual([]);
  });

  it('when the browser has no visual viewport, then the end is measured by the window height', () => {
    const reader = { ...readerAt(1200, 2000), visualViewport: null };

    keepThePageEnd(reader, NOTHING_HELD, () => reader.grow(96), NOTHING_RESTORED);

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when a page transition holds the scroll, then the room grows and the page does not move', () => {
    const reader = readerAt(1200, 2000);
    let grown = false;

    keepThePageEnd(reader, { holding: true }, () => (grown = true), NOTHING_RESTORED);

    expect(grown).toBe(true);
    expect(reader.scrolls).toEqual([]);
  });

  it('when Zpět still restores the place of the page, then the page does not move', () => {
    const reader = readerAt(1200, 2000);

    keepThePageEnd(
      reader,
      NOTHING_HELD,
      () => reader.grow(96),
      () => true,
    );

    expect(reader.scrolls).toEqual([]);
  });

  it('when the reader reads further up the page, then the page does not move', () => {
    const reader = readerAt(600, 2000);

    keepThePageEnd(reader, NOTHING_HELD, () => reader.grow(96), NOTHING_RESTORED);

    expect(reader.scrolls).toEqual([]);
  });

  it('when the page has not been scrolled at all, then it stays at its top', () => {
    const reader = readerAt(0, 800);

    keepThePageEnd(reader, NOTHING_HELD, () => reader.grow(96), NOTHING_RESTORED);

    expect(reader.scrolls).toEqual([]);
  });

  it('when there is no window, then the room still grows', () => {
    let grown = false;

    keepThePageEnd(null, NOTHING_HELD, () => (grown = true), NOTHING_RESTORED);

    expect(grown).toBe(true);
  });
});
