import { restoreWindowProperties, windowPropertiesOf } from './window-properties';

describe('Given the window properties kept for a window', () => {
  function fakeWindow(): Window {
    const window = {} as Window;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    return window;
  }

  it('when the setup runs again on the same window after a spec deleted one, then the first capture is kept and puts it back', () => {
    const kept = new WeakMap<object, Map<string, PropertyDescriptor | undefined>>();
    const window = fakeWindow();
    windowPropertiesOf(window, kept);
    delete (window as { scrollY?: number }).scrollY;

    restoreWindowProperties(window, windowPropertiesOf(window, kept));

    expect(window.scrollY).toBe(0);
  });

  it('when a new window is seen, then its own properties are captured', () => {
    const kept = new WeakMap<object, Map<string, PropertyDescriptor | undefined>>();
    windowPropertiesOf(fakeWindow(), kept);
    const other = fakeWindow();
    Object.defineProperty(other, 'scrollY', { configurable: true, value: 7 });

    restoreWindowProperties(other, windowPropertiesOf(other, kept));

    expect(other.scrollY).toBe(7);
  });

  it('when a property the window never had was added by a spec, then it is removed again', () => {
    const kept = new WeakMap<object, Map<string, PropertyDescriptor | undefined>>();
    const window = fakeWindow();
    windowPropertiesOf(window, kept);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => undefined });

    restoreWindowProperties(window, windowPropertiesOf(window, kept));

    expect('matchMedia' in window).toBe(false);
  });
});
