import { jsdomWindowProperties } from './testing/jsdom-window';

describe('Given a spec that changes a window property jsdom provides', () => {
  it('when one test deletes scrollTo and scrollY and replaces innerWidth, then they are gone for that test', () => {
    delete (window as { scrollTo?: unknown }).scrollTo;
    delete (window as { scrollY?: number }).scrollY;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1 });

    expect(window.scrollTo).toBeUndefined();
    expect(window.scrollY).toBeUndefined();
    expect(window.innerWidth).toBe(1);
  });

  it("when the next test runs, then jsdom's own scrollTo, scrollY and innerWidth are back", () => {
    expect(typeof window.scrollTo).toBe('function');
    expect(window.scrollY).toBe(0);
    expect(window.innerWidth).toBe(1024);
  });
});

describe('Given spec files that share one worker, each loading the test setup again', () => {
  it('when a spec file before this one left scrollY deleted, then the setup still puts back the scrollY jsdom made', () => {
    delete (window as { scrollY?: number }).scrollY;

    const seenByTheNextFile = jsdomWindowProperties();

    expect(seenByTheNextFile.get('scrollY')).toBeDefined();
  });
});
