import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { AdministrationCopy } from './administration-copy';

const SUMMARY = { today: '2026-11-06', byYear: [{ year: 2026, received: 3 }] };

function contents(chunks: CopyContents['chunks'], summary: unknown = { donations: SUMMARY }) {
  return { chunks, summary, storedAt: '2026-11-06T08:00:00Z' } satisfies CopyContents;
}

function chunk(id: string, ...rows: unknown[]) {
  return { id, rowsSha256: id, rows };
}

describe('Given the administration copy of this device', () => {
  let opened: WritableSignal<OpenedCopy | null>;
  let stored: WritableSignal<CopyContents | null>;
  let copy: AdministrationCopy;

  beforeEach(() => {
    stored = signal<CopyContents | null>(null);
    opened = signal<OpenedCopy | null>(null);
    TestBed.configureTestingModule({
      providers: [{ provide: DeviceVault, useValue: { administration: opened.asReadonly() } }],
    });
    copy = TestBed.inject(AdministrationCopy);
  });

  function open(): void {
    opened.set({
      store: { contents: stored.asReadonly() },
      reason: 'unlocked',
      account: { userHandle: 'u', email: 'e' },
    } as unknown as OpenedCopy);
  }

  it('when no copy is open, then it offers no rows, no summary and no time of storing', () => {
    expect(copy.opened()).toBe(false);
    expect(copy.rows('donations', 'receipts')()).toBeNull();
    expect(copy.summary()).toBeNull();
    expect(copy.storedAt()).toBeNull();
  });

  it('when the copy is open but not loaded yet, then its rows are still null', () => {
    open();

    expect(copy.opened()).toBe(false);
    expect(copy.rows('donations', 'receipts')()).toBeNull();
  });

  describe('when the copy is open and loaded', () => {
    beforeEach(() => {
      open();
      stored.set(
        contents([
          chunk('donations/receipts:2026', { n: 'b1' }, { n: 'b2' }),
          chunk('donations/payments:2026-01', { n: 'p' }),
          chunk('donations/receipts:2025', { n: 'a' }),
          chunk('donations/symbol-claims', { n: 's' }),
          chunk('donations/receipts-extra:2026', { n: 'x' }),
          chunk('donors/receipts:2026', { n: 'other part' }),
        ]),
      );
    });

    it('then a kind gives the rows of every chunk of that kind, chunks by id, rows as stored', () => {
      expect(copy.rows('donations', 'receipts')()).toEqual([{ n: 'a' }, { n: 'b1' }, { n: 'b2' }]);
    });

    it('then a kind without a month or year gives its one chunk', () => {
      expect(copy.rows('donations', 'symbol-claims')()).toEqual([{ n: 's' }]);
    });

    it('then a kind the copy holds no chunk of gives an empty list', () => {
      expect(copy.rows('donations', 'links')()).toEqual([]);
    });

    it('then it gives the donations summary and the time the copy was stored', () => {
      expect(copy.opened()).toBe(true);
      expect(copy.summary()).toEqual(SUMMARY);
      expect(copy.storedAt()).toBe('2026-11-06T08:00:00Z');
    });

    it('then asking for one kind twice gives the same signal', () => {
      expect(copy.rows('donations', 'receipts')).toBe(copy.rows('donations', 'receipts'));
    });

    it('and the copy locks, then the rows are null again', () => {
      const receipts = copy.rows('donations', 'receipts');
      expect(receipts()).not.toBeNull();

      opened.set(null);

      expect(receipts()).toBeNull();
    });
  });

  it('when the stored summary has another shape, then the summary is null and the rows stay', () => {
    open();
    stored.set(contents([chunk('donations/receipts:2026', { n: 'a' })], { donations: null }));

    expect(copy.summary()).toBeNull();
    expect(copy.rows('donations', 'receipts')()).toEqual([{ n: 'a' }]);
  });
});
