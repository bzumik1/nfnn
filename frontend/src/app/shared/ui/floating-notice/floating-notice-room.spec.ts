import { keepRoomForFloatingNotice } from './floating-notice-room';

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
    keepRoomForFloatingNotice(document, bar(80));

    expect(root.classList).toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('80px');
  });

  it('when the only bar goes, then the page keeps no room', () => {
    const release = keepRoomForFloatingNotice(document, bar(80));

    release();

    expect(root.classList).not.toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('');
  });

  it('when another bar comes before the first goes, then the page still keeps room for the bar left on screen', () => {
    const releaseFirst = keepRoomForFloatingNotice(document, bar(80));
    keepRoomForFloatingNotice(document, bar(120));

    releaseFirst();

    expect(root.classList).toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('120px');
  });

  it('when the later bar goes first, then the page keeps room for the earlier one', () => {
    keepRoomForFloatingNotice(document, bar(80));
    const releaseSecond = keepRoomForFloatingNotice(document, bar(120));

    releaseSecond();

    expect(root.classList).toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('80px');
  });

  it('when both bars go, then the page keeps no room', () => {
    const releaseFirst = keepRoomForFloatingNotice(document, bar(80));
    const releaseSecond = keepRoomForFloatingNotice(document, bar(120));

    releaseFirst();
    releaseSecond();

    expect(root.classList).not.toContain('has-floating-notice');
    expect(root.style.getPropertyValue('--floating-notice-height')).toBe('');
  });
});
