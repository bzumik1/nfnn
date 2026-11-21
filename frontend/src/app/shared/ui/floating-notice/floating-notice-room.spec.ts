import { keepRoomForFloatingNotice } from './floating-notice-room';

const NOTHING_HELD = { holding: false };
const NOTHING_SETTLING = { settling: false };

describe('Given floating bars at the bottom of the screen', () => {
  const root = document.documentElement;

  const bar = (height: number): HTMLElement => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'offsetHeight', { value: height });
    document.body.append(element);
    return element;
  };

  afterEach(() => {
    root.classList.remove('has-floating-notice');
    root.style.removeProperty('--floating-notice-height');
    document.body.replaceChildren();
  });

  it('when one bar is shown, then the page keeps room as tall as the bar', () => {
    keepRoomForFloatingNotice(document, bar(80), NOTHING_HELD, NOTHING_SETTLING);

    expect(root.classList).toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('80px');
  });

  it('when the only bar goes, then the page keeps no room', () => {
    const release = keepRoomForFloatingNotice(document, bar(80), NOTHING_HELD, NOTHING_SETTLING);

    release();

    expect(root.classList).not.toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('');
  });

  it('when another bar comes before the first goes, then the page still keeps room for the bar left on screen', () => {
    const releaseFirst = keepRoomForFloatingNotice(
      document,
      bar(80),
      NOTHING_HELD,
      NOTHING_SETTLING,
    );
    keepRoomForFloatingNotice(document, bar(120), NOTHING_HELD, NOTHING_SETTLING);

    releaseFirst();

    expect(root.classList).toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('120px');
  });

  it('when the later bar goes first, then the page keeps room for the earlier one', () => {
    keepRoomForFloatingNotice(document, bar(80), NOTHING_HELD, NOTHING_SETTLING);
    const releaseSecond = keepRoomForFloatingNotice(
      document,
      bar(120),
      NOTHING_HELD,
      NOTHING_SETTLING,
    );

    releaseSecond();

    expect(root.classList).toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('80px');
  });

  it('when both bars go, then the page keeps no room', () => {
    const releaseFirst = keepRoomForFloatingNotice(
      document,
      bar(80),
      NOTHING_HELD,
      NOTHING_SETTLING,
    );
    const releaseSecond = keepRoomForFloatingNotice(
      document,
      bar(120),
      NOTHING_HELD,
      NOTHING_SETTLING,
    );

    releaseFirst();
    releaseSecond();

    expect(root.classList).not.toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('');
  });

  const pageScrolledTo = (scrollY: number) => {
    const scrolls: ScrollToOptions[] = [];
    const roomHeight = () =>
      root.classList.contains('has-floating-notice')
        ? parseFloat(root.style.getPropertyValue('--floating-notice-height'))
        : 0;
    const view = {
      scrollY,
      innerHeight: 800,
      visualViewport: null,
      document: {
        documentElement: {
          get scrollHeight() {
            return 2000 + roomHeight();
          },
        },
      },
      scrollTo: (options: ScrollToOptions) => scrolls.push(options),
    };
    const page = {
      documentElement: root,
      defaultView: view,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Document;
    return { page, scrolls };
  };

  it('when a bar arrives while the reader stands at the end of the page, then the page scrolls to its new end at once', () => {
    const { page, scrolls } = pageScrolledTo(1200);

    keepRoomForFloatingNotice(page, bar(80), NOTHING_HELD, NOTHING_SETTLING);

    expect(scrolls).toEqual([{ top: 2080, behavior: 'instant' }]);
  });

  it('when a bar arrives at the end of the page while a page transition holds the scroll, then the room grows and the page does not move', () => {
    const { page, scrolls } = pageScrolledTo(1200);

    keepRoomForFloatingNotice(page, bar(80), { holding: true }, NOTHING_SETTLING);

    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('80px');
    expect(scrolls).toEqual([]);
  });

  it('when a bar arrives while the reader reads further up the page, then the page does not move', () => {
    const { page, scrolls } = pageScrolledTo(600);

    keepRoomForFloatingNotice(page, bar(80), NOTHING_HELD, NOTHING_SETTLING);

    expect(scrolls).toEqual([]);
  });
});
