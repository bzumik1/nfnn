import { followLargeTitle, LargeTitleWatch } from './large-title';

describe('Given a page whose large title may scroll under the edge at the top', () => {
  const HEADER_HEIGHT = 92;
  const LINE_HEIGHT = 40;
  const rangeLines = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  let lines: number;
  let header: HTMLElement;
  let main: HTMLElement;
  let heading: HTMLHeadingElement;
  let headingBottom: number;
  let shown: (string | null)[];
  let watch: LargeTitleWatch;

  function scrollTo(top: number, bottom: number): void {
    headingBottom = bottom;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: top });
    window.dispatchEvent(new Event('scroll'));
  }

  function nextFrame(): Promise<void> {
    return new Promise((done) => requestAnimationFrame(() => done()));
  }

  function boxOf(bottom: () => number): () => DOMRect {
    return () =>
      ({
        bottom: bottom(),
        top: bottom() - LINE_HEIGHT * lines,
        height: LINE_HEIGHT * lines,
      }) as DOMRect;
  }

  function lineBoxesOf(element: HTMLElement): DOMRectList {
    const top = element.getBoundingClientRect().top;
    return Array.from(
      { length: lines },
      (_, line) =>
        ({
          top: top + LINE_HEIGHT * line,
          bottom: top + LINE_HEIGHT * (line + 1),
          height: LINE_HEIGHT,
        }) as DOMRect,
    ) as unknown as DOMRectList;
  }

  beforeEach(() => {
    lines = 1;
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value(this: Range): DOMRectList {
        return lineBoxesOf(this.startContainer as HTMLElement);
      },
    });
    header = document.createElement('header');
    header.getBoundingClientRect = () => ({ height: HEADER_HEIGHT }) as DOMRect;
    main = document.createElement('main');
    main.id = 'obsah';
    heading = document.createElement('h1');
    heading.textContent = '  Moje\n   dary ';
    heading.getBoundingClientRect = boxOf(() => headingBottom);
    main.append(heading);
    document.body.append(header, main);
    shown = [];
    scrollTo(0, 180);
    watch = followLargeTitle(document, header, (title) => shown.push(title));
  });

  afterEach(() => {
    watch.release();
    header.remove();
    main.remove();
    delete (window as { scrollY?: number }).scrollY;
    if (rangeLines) {
      Object.defineProperty(Range.prototype, 'getClientRects', rangeLines);
    } else {
      delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
    }
  });

  it('when the page is at its top, then no title stands in the edge, since the large one is on screen', () => {
    expect(shown.at(-1) ?? null).toBeNull();
  });

  it('when the large title scrolls under the edge, then its text stands in the edge, on one line', async () => {
    scrollTo(160, HEADER_HEIGHT - 1);
    await nextFrame();

    expect(shown.at(-1)).toBe('Moje dary');
  });

  it('when the page scrolls only a little, so the large title is still below the edge, then no title stands in it', async () => {
    scrollTo(40, 140);
    await nextFrame();

    expect(shown.at(-1) ?? null).toBeNull();
  });

  it('when a title on two lines scrolls so its first line passes the bottom of the bar while its second line is still below it, then its text stands in the edge', async () => {
    lines = 2;

    scrollTo(160, HEADER_HEIGHT + LINE_HEIGHT);
    await nextFrame();

    expect(shown.at(-1)).toBe('Moje dary');
  });

  it('when the bottom of the first line is still a pixel below the bottom of the bar, then no title stands in the edge', async () => {
    lines = 2;

    scrollTo(120, HEADER_HEIGHT + LINE_HEIGHT + 1);
    await nextFrame();

    expect(shown.at(-1) ?? null).toBeNull();
  });

  it('when the page scrolls back until the bottom of the first line is below the bar again, then the title leaves the edge at the same line it came at', async () => {
    lines = 2;
    scrollTo(160, HEADER_HEIGHT + LINE_HEIGHT);
    await nextFrame();

    scrollTo(159, HEADER_HEIGHT + LINE_HEIGHT + 1);
    await nextFrame();

    expect(shown).toEqual(['Moje dary', null]);
  });

  it('when the large title comes back, then the title leaves the edge again', async () => {
    scrollTo(160, 20);
    await nextFrame();
    scrollTo(0, 180);
    await nextFrame();

    expect(shown.at(-1)).toBeNull();
  });

  it('when another page opens already scrolled, then the edge names its title once checked', () => {
    heading.textContent = 'Účty';
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 400 });
    headingBottom = -200;

    watch.check();

    expect(shown.at(-1)).toBe('Účty');
  });

  it('when a page has no large title, then nothing stands in the edge', async () => {
    heading.remove();

    scrollTo(400, -200);
    await nextFrame();

    expect(shown.at(-1) ?? null).toBeNull();
  });

  it('when the watch is released, then scrolling no longer changes the edge', async () => {
    watch.release();

    scrollTo(160, 20);
    await nextFrame();

    expect(shown).not.toContain('Moje dary');
  });
});
