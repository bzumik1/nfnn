import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../app.config';
import { APPEARANCE_STORAGE_KEY, Appearance, appearanceAtStart } from './appearance';

interface FakeQuery {
  matches: boolean;
  listeners: ((event: { matches: boolean }) => void)[];
}

describe('Given the appearance the visitor chooses for the site on this device', () => {
  let query: FakeQuery;
  let root: HTMLElement;
  let meta: HTMLMetaElement;

  function start(): Appearance {
    TestBed.configureTestingModule({ providers: [appearanceAtStart] });
    const appearance = TestBed.inject(Appearance);
    appearance.start();
    return appearance;
  }

  function systemTurns(dark: boolean): void {
    query.matches = dark;
    query.listeners.forEach((listener) => listener({ matches: dark }));
  }

  beforeEach(() => {
    localStorage.clear();
    query = { matches: false, listeners: [] };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () =>
        ({
          get matches() {
            return query.matches;
          },
          addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
            query.listeners.push(listener),
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    });
    root = document.documentElement;
    root.removeAttribute('data-appearance');
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    meta.content = 'light dark';
    document.head.append(meta);
  });

  afterEach(() => {
    meta.remove();
    root.removeAttribute('data-appearance');
    localStorage.clear();
    vi.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when nothing was chosen, then it follows the device and leaves the page to the system colours', () => {
    query.matches = true;

    const appearance = start();

    expect(appearance.choice()).toBe('auto');
    expect(appearance.dark()).toBe(true);
    expect(root.hasAttribute('data-appearance')).toBe(false);
    expect(meta.content).toBe('light dark');
  });

  it('when the device turns dark while the choice is automatic, then the site turns dark with it', () => {
    const appearance = start();

    systemTurns(true);

    expect(appearance.dark()).toBe(true);
  });

  it('when the visitor chooses the dark appearance on a light device, then the page turns dark at once and the choice is kept on the device', () => {
    const appearance = start();

    appearance.choose('dark');

    expect(appearance.dark()).toBe(true);
    expect(root.getAttribute('data-appearance')).toBe('dark');
    expect(meta.content).toBe('dark');
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark');
  });

  it('when the visitor chooses the light appearance on a dark device, then the page stays light even when the device changes', () => {
    query.matches = true;
    const appearance = start();

    appearance.choose('light');
    systemTurns(true);

    expect(appearance.dark()).toBe(false);
    expect(root.getAttribute('data-appearance')).toBe('light');
    expect(meta.content).toBe('light');
  });

  it('when the visitor goes back to automatic, then the page follows the device again and nothing is kept', () => {
    const appearance = start();
    appearance.choose('dark');

    appearance.choose('auto');

    expect(appearance.dark()).toBe(false);
    expect(root.hasAttribute('data-appearance')).toBe(false);
    expect(meta.content).toBe('light dark');
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
  });

  it('when the site starts with a kept choice, then that choice holds from the start', () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark');

    const appearance = start();

    expect(appearance.choice()).toBe('dark');
    expect(root.getAttribute('data-appearance')).toBe('dark');
  });

  it('when the kept value is not a known choice, then the site follows the device', () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'blue');
    query.matches = true;

    const appearance = start();

    expect(appearance.choice()).toBe('auto');
    expect(appearance.dark()).toBe(true);
    expect(root.hasAttribute('data-appearance')).toBe(false);
  });

  it('when the browser refuses the storage, then the choice still holds for this visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refused');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });
    const appearance = start();

    appearance.choose('dark');

    expect(appearance.choice()).toBe('dark');
    expect(root.getAttribute('data-appearance')).toBe('dark');
  });

  it('when another open tab chooses the dark appearance, then this tab turns dark too without a reload', () => {
    const appearance = start();

    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: APPEARANCE_STORAGE_KEY,
        newValue: 'dark',
        storageArea: localStorage,
      }),
    );

    expect(appearance.choice()).toBe('dark');
    expect(root.getAttribute('data-appearance')).toBe('dark');
    expect(meta.content).toBe('dark');
  });

  it('when another open tab goes back to automatic, then this tab follows the device again', () => {
    const appearance = start();
    appearance.choose('light');

    localStorage.removeItem(APPEARANCE_STORAGE_KEY);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: APPEARANCE_STORAGE_KEY,
        newValue: null,
        storageArea: localStorage,
      }),
    );

    expect(appearance.choice()).toBe('auto');
    expect(root.hasAttribute('data-appearance')).toBe(false);
  });

  it('when another key of the site changes in another tab, then the choice stays', () => {
    const appearance = start();
    appearance.choose('dark');

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'nfnn.other',
        newValue: 'light',
        storageArea: localStorage,
      }),
    );

    expect(appearance.choice()).toBe('dark');
  });

  it('when the same key changes in the session storage of another tab, then the choice stays', () => {
    const appearance = start();
    appearance.choose('dark');

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: APPEARANCE_STORAGE_KEY,
        newValue: 'light',
        storageArea: sessionStorage,
      }),
    );

    expect(appearance.choice()).toBe('dark');
  });

  it('when another tab clears the whole storage, then this tab follows the device again', () => {
    const appearance = start();
    appearance.choose('dark');

    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));

    expect(appearance.choice()).toBe('auto');
  });

  it('when the app is configured, then it applies the kept choice at the start', () => {
    expect(appConfig.providers).toContain(appearanceAtStart);
  });
});
