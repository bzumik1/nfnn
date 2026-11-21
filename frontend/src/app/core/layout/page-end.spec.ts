import { keepThePageEnd, ScrolledView } from './page-end';

interface Reader extends ScrolledView {
  readonly scrolls: ScrollToOptions[];
  grow(by: number): void;
}

function readerAt(scrollY: number, scrollHeight: number, innerHeight = 800): Reader {
  const page = { scrollHeight };
  const scrolls: ScrollToOptions[] = [];
  return {
    scrollY,
    innerHeight,
    document: { documentElement: page },
    scrolls,
    scrollTo: (options: ScrollToOptions) => scrolls.push(options),
    grow: (by: number) => (page.scrollHeight += by),
  };
}

describe('Given a page whose bottom room grows when a bar appears at the bottom of the screen', () => {
  it('when the reader stands at the end of the page, then the page moves by the added room at once', () => {
    const reader = readerAt(1200, 2000);

    keepThePageEnd(reader, () => reader.grow(96));

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when the reader stands within two pixels of the end, then the page still keeps its end in view', () => {
    const reader = readerAt(1198, 2000);

    keepThePageEnd(reader, () => reader.grow(96));

    expect(reader.scrolls).toEqual([{ top: 2096, behavior: 'instant' }]);
  });

  it('when the reader reads further up the page, then the page does not move', () => {
    const reader = readerAt(600, 2000);

    keepThePageEnd(reader, () => reader.grow(96));

    expect(reader.scrolls).toEqual([]);
  });

  it('when the page has not been scrolled at all, then it stays at its top', () => {
    const reader = readerAt(0, 800);

    keepThePageEnd(reader, () => reader.grow(96));

    expect(reader.scrolls).toEqual([]);
  });

  it('when there is no window, then the room still grows', () => {
    let grown = false;

    keepThePageEnd(null, () => (grown = true));

    expect(grown).toBe(true);
  });
});
