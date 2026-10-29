import { TestBed } from '@angular/core/testing';

import { RELOAD_WINDOW_MS, ReloadGuard, SESSION_STORAGE } from './reload-guard';

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const START = Date.UTC(2026, 10, 5, 9, 0, 0);

function guardWith(storage: () => Storage): ReloadGuard {
  TestBed.configureTestingModule({ providers: [{ provide: SESSION_STORAGE, useValue: storage }] });
  return TestBed.inject(ReloadGuard);
}

describe('Given a reload guard over a working session storage', () => {
  let storage: MemoryStorage;
  let guard: ReloadGuard;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    storage = new MemoryStorage();
    guard = guardWith(() => storage);
  });

  afterEach(() => vi.useRealTimers());

  it('when a reason claims its first reload, then it may reload and the time is kept under its own key', () => {
    expect(guard.claim('chunk-load')).toBe(true);
    expect(storage.getItem('nfnn.reload.chunk-load')).toBe(String(START));
  });

  it('when the same reason claims again within a minute, then it may not reload', () => {
    guard.claim('chunk-load');
    vi.setSystemTime(START + RELOAD_WINDOW_MS - 1);

    expect(guard.claim('chunk-load')).toBe(false);
    expect(storage.getItem('nfnn.reload.chunk-load')).toBe(String(START));
  });

  it('when the same reason claims again after a minute, then it may reload once more', () => {
    guard.claim('chunk-load');
    vi.setSystemTime(START + RELOAD_WINDOW_MS);

    expect(guard.claim('chunk-load')).toBe(true);
    expect(guard.claim('chunk-load')).toBe(false);
  });

  it('when the kept time lies ahead of the clock, then it may reload and keeps the current time', () => {
    storage.setItem('nfnn.reload.chunk-load', String(START + 10 * RELOAD_WINDOW_MS));

    expect(guard.claim('chunk-load')).toBe(true);
    expect(storage.getItem('nfnn.reload.chunk-load')).toBe(String(START));
  });

  it('when the kept value is not a time, then it may reload', () => {
    storage.setItem('nfnn.reload.chunk-load', 'not-a-time');

    expect(guard.claim('chunk-load')).toBe(true);
  });
});

describe('Given a reload guard without a session storage', () => {
  it('when the storage cannot be reached, then it never allows an automatic reload', () => {
    const guard = guardWith(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    expect(guard.claim('chunk-load')).toBe(false);
    expect(guard.claim('chunk-load')).toBe(false);
  });

  it('when the storage refuses the write, then it never allows an automatic reload', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    const guard = guardWith(() => storage);

    expect(guard.claim('chunk-load')).toBe(false);
  });

  it('when the storage drops what it was given, then it never allows an automatic reload', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => undefined;
    const guard = guardWith(() => storage);

    expect(guard.claim('chunk-load')).toBe(false);
  });
});
