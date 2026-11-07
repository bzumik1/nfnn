import { TestBed } from '@angular/core/testing';

import { DiagnosticEvents } from './diagnostic-events';

describe('Given the diagnostic events of this page', () => {
  let events: DiagnosticEvents;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T09:00:00Z'));
    events = TestBed.inject(DiagnosticEvents);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('when events are recorded, then they are listed oldest first with their age in whole seconds', () => {
    events.record({ kind: 'pdf-render', place: 'global', name: 'TypeError', detail: 'drawing' });
    vi.advanceTimersByTime(90_500);
    events.record({ kind: 'copy-sync', place: null, name: null, detail: 'mismatch' });
    vi.advanceTimersByTime(10_000);

    expect(events.listed()).toEqual([
      {
        secondsAgo: 100,
        kind: 'pdf-render',
        place: 'global',
        name: 'TypeError',
        detail: 'drawing',
      },
      { secondsAgo: 10, kind: 'copy-sync', place: null, name: null, detail: 'mismatch' },
    ]);
  });

  it('when more than fifty are recorded, then only the fifty latest are kept', () => {
    for (let index = 0; index < 60; index++) {
      events.record({ kind: 'unexpected', place: 'global', name: 'Error', detail: null });
      vi.advanceTimersByTime(1_000);
    }

    const listed = events.listed();

    expect(listed).toHaveLength(50);
    expect(listed[0].secondsAgo).toBe(50);
  });

  it('when an event is older than a day, then it is no longer listed', () => {
    events.record({ kind: 'unexpected', place: 'global', name: 'Error', detail: null });
    vi.advanceTimersByTime(24 * 3_600_000 + 1_000);

    expect(events.listed()).toEqual([]);
  });

  it('when they are cleared, then nothing is listed', () => {
    events.record({ kind: 'unexpected', place: 'global', name: 'Error', detail: null });

    events.clear();

    expect(events.listed()).toEqual([]);
  });

  it('when events are recorded, then nothing is written to Web Storage, a cookie or IndexedDB', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(document, 'cookie', 'set');
    const open = vi.fn();
    vi.stubGlobal('indexedDB', { open });

    events.record({ kind: 'unexpected', place: 'global', name: 'Error', detail: null });
    events.listed();

    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
