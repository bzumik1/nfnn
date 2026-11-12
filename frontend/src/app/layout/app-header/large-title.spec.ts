import { followLargeTitle, LargeTitleWatch } from './large-title';

describe('Given a page whose large title may scroll under the edge at the top', () => {
  const HEADER_HEIGHT = 92;
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
    return () => ({ bottom: bottom(), top: bottom() - 40, height: 40 }) as DOMRect;
  }

  beforeEach(() => {
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
