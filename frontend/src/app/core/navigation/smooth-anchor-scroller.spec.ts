import { ViewportScroller } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideSmoothAnchorScrolling } from './smooth-anchor-scroller';

function spyOnScrolling() {
  return vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
}

describe('Given the scroller the router uses for links to a section', () => {
  const realMatchMedia = window.matchMedia;
  let section: HTMLElement;
  let scrollTo: ReturnType<typeof spyOnScrolling>;

  function scrollerWith(lessMotion: boolean): ViewportScroller {
    window.matchMedia = ((query: string) => ({
      matches: lessMotion && query.includes('reduce'),
      media: query,
    })) as typeof window.matchMedia;
    TestBed.configureTestingModule({ providers: [provideSmoothAnchorScrolling()] });
    return TestBed.inject(ViewportScroller);
  }

  beforeEach(() => {
    scrollTo = spyOnScrolling();
    section = document.createElement('section');
    section.id = 'kontakt';
    section.tabIndex = -1;
    document.body.appendChild(section);
  });

  afterEach(() => {
    section.remove();
    window.matchMedia = realMatchMedia;
  });

  it('when a link leads to a section, then the page glides to it and the section takes the focus', () => {
    scrollerWith(false).scrollToAnchor('kontakt');

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    expect(document.activeElement).toBe(section);
  });

  it('when the visitor asks for less motion, then the page jumps to the section', () => {
    scrollerWith(true).scrollToAnchor('kontakt');

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
  });

  it('when the router restores a position, then the page jumps there', () => {
    scrollerWith(false).scrollToPosition([0, 120]);

    expect(scrollTo).toHaveBeenCalledWith(expect.not.objectContaining({ behavior: 'smooth' }));
  });

  it('when a link names no section on the page, then nothing scrolls', () => {
    scrollerWith(false).scrollToAnchor('nikde');

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
