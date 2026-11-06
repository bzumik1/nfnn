import { followScrollEdge, SCROLL_EDGE_TONE, SCROLLED_CLASS } from './scroll-edge';

describe('Given the edge at the top of a page one level deeper than its tab', () => {
  let header: HTMLElement;
  let content: HTMLElement;
  let underEdge: Element[];
  let release: () => void;

  function scrollTo(top: number): void {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: top });
    window.dispatchEvent(new Event('scroll'));
  }

  function nextFrame(): Promise<void> {
    return new Promise((done) => requestAnimationFrame(() => done()));
  }

  beforeEach(() => {
    header = document.createElement('header');
    content = document.createElement('section');
    content.style.backgroundColor = 'rgb(15, 23, 42)';
    const line = document.createElement('p');
    line.textContent = 'První odstavec článku.';
    content.append(line);
    document.body.append(header, content);
    underEdge = [line, content, document.body];
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => underEdge,
    });
    scrollTo(0);
    release = followScrollEdge(document, header);
  });

  afterEach(() => {
    release();
    header.remove();
    content.remove();
    delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
    delete (window as { scrollY?: number }).scrollY;
  });

  it('when the page is at its top, then the edge is not raised, so the page looks as designed', () => {
    expect(header.classList).not.toContain(SCROLLED_CLASS);
  });

  describe('when the page scrolls', () => {
    beforeEach(async () => {
      scrollTo(240);
      await nextFrame();
    });

    it('then the edge is raised in the colour of the content coming up under it, so no line runs under the back button', () => {
      expect(header.classList).toContain(SCROLLED_CLASS);
      expect(header.style.getPropertyValue(SCROLL_EDGE_TONE)).toBe('rgb(15, 23, 42)');
    });

    it('and lighter content comes up under it, then the edge takes that colour', async () => {
      const body = document.createElement('div');
      body.style.backgroundColor = 'rgb(255, 255, 255)';
      underEdge = [body, document.body];

      scrollTo(900);
      await nextFrame();

      expect(header.style.getPropertyValue(SCROLL_EDGE_TONE)).toBe('rgb(255, 255, 255)');
    });

    it('and it returns to the top, then the edge is lowered again', async () => {
      scrollTo(0);
      await nextFrame();

      expect(header.classList).not.toContain(SCROLLED_CLASS);
    });
  });

  it('when the edge is released, then scrolling no longer raises it', async () => {
    release();

    scrollTo(240);
    await nextFrame();

    expect(header.classList).not.toContain(SCROLLED_CLASS);
  });
});
