import { keepRoomForTabBar } from './tab-bar-room';

describe('Given the tab bar at the bottom of the screen', () => {
  const root = document.documentElement;
  let resized: (() => void)[];

  const bar = (height: number): HTMLElement => {
    const element = document.createElement('nav');
    Object.defineProperty(element, 'offsetHeight', { value: height, configurable: true });
    document.body.append(element);
    return element;
  };

  beforeEach(() => {
    resized = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {}
        observe(): void {
          resized.push(this.callback);
        }
        disconnect(): void {
          resized = resized.filter((callback) => callback !== this.callback);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    root.style.removeProperty('--tab-bar-rendered-height');
    document.body.replaceChildren();
  });

  it('when it is shown, then the page keeps room as tall as the bar', () => {
    keepRoomForTabBar(document, bar(64));

    expect(root.style.getPropertyValue('--tab-bar-rendered-height')).toBe('64px');
  });

  it('when larger text makes it grow, then the room grows with it', () => {
    const element = bar(64);
    keepRoomForTabBar(document, element);

    Object.defineProperty(element, 'offsetHeight', { value: 142 });
    resized.forEach((callback) => callback());

    expect(root.style.getPropertyValue('--tab-bar-rendered-height')).toBe('142px');
  });

  it('when the next area brings its own bar before the first goes, then the room stays that of the bar on screen', () => {
    const releaseFirst = keepRoomForTabBar(document, bar(64));
    keepRoomForTabBar(document, bar(74));

    releaseFirst();

    expect(root.style.getPropertyValue('--tab-bar-rendered-height')).toBe('74px');
  });

  it('when the last bar goes, then the theme decides the room again', () => {
    const release = keepRoomForTabBar(document, bar(64));

    release();

    expect(root.style.getPropertyValue('--tab-bar-rendered-height')).toBe('');
  });
});
