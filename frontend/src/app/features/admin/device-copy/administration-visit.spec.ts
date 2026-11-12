import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../../core/auth/auth-store';
import { Connectivity } from '../../../core/connectivity/connectivity';
import type { AccountStore, CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import {
  AdministrationCopyDownload,
  type AdministrationDownloadOutcome,
} from './administration-copy-download';
import { AdministrationVisit } from './administration-visit';
import type { VisitMark } from './visit-changes';

const ME = 'admin-me';
const PAVEL = 'admin-pavel';

function payment(id: string, bookedOn: string, amountMinor: number) {
  return { id, bookedOn, amountMinor, currency: 'CZK' };
}

function copy(payments: unknown[], seen?: VisitMark): CopyContents {
  return {
    chunks: [
      { id: 'donations/payments:2026-11', rowsSha256: 'p', rows: payments },
      {
        id: 'donors/accounts:2026-01',
        rowsSha256: 'a',
        rows: [{ donorId: PAVEL, name: 'Pavel Znamenáček' }],
      },
      {
        id: 'donors/audit:2026-11',
        rowsSha256: 'x',
        rows: [{ id: 'action-1', adminId: PAVEL, action: 'PAIR_PAYMENT', performedAt: '' }],
      },
    ],
    summary: { donations: { today: '2026-11-12', byYear: [] } },
    storedAt: '2026-11-12T08:00:00Z',
    ...(seen === undefined ? {} : { seen }),
  };
}

const MARK: VisitMark = {
  at: '2026-11-10T13:05:00.000Z',
  payments: ['payment-1'],
  donors: [],
  receipts: [],
  actions: [],
};

describe('Given the summary of what is new since the last visit on this device', () => {
  let opened: WritableSignal<OpenedCopy | null>;
  let checkedAt: WritableSignal<string | null>;
  let offline: WritableSignal<boolean>;
  let kept: boolean;
  let refresh: ReturnType<
    typeof vi.fn<(startingNow?: boolean) => Promise<AdministrationDownloadOutcome>>
  >;
  let replaced: CopyContents[];
  let visit: AdministrationVisit;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-12T09:30:00Z') });
    opened = signal<OpenedCopy | null>(null);
    checkedAt = signal<string | null>(null);
    offline = signal(false);
    kept = true;
    replaced = [];
    refresh = vi
      .fn<(startingNow?: boolean) => Promise<AdministrationDownloadOutcome>>()
      .mockImplementation(async () => {
        checkedAt.set(new Date().toISOString());
        return 'unchanged';
      });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DeviceVault,
          useValue: {
            administration: opened.asReadonly(),
            stores: () => kept,
            withCopyLock: <T>(_store: AccountStore, work: () => Promise<T>) => work(),
            replaceContents: async (store: AccountStore, contents: CopyContents) => {
              replaced.push(contents);
              (store.contents as WritableSignal<CopyContents | null>).set(contents);
              return true;
            },
          },
        },
        { provide: AdministrationCopyDownload, useValue: { refresh, checkedAt } },
        { provide: Connectivity, useValue: { offline: offline.asReadonly() } },
        { provide: AuthStore, useValue: { donor: signal({ id: ME }).asReadonly() } },
      ],
    });
    visit = TestBed.inject(AdministrationVisit);
  });

  afterEach(() => vi.useRealTimers());

  function open(held: CopyContents | null): WritableSignal<CopyContents | null> {
    const contents = signal<CopyContents | null>(held);
    checkedAt.set(null);
    opened.set({
      store: { copyId: 'copy-1', contents } as unknown as AccountStore,
      reason: 'unlocked',
      account: { email: 'a@example.cz', userHandle: 'h', administrator: true },
    });
    TestBed.tick();
    return contents;
  }

  it('when no copy of the administration is open, then there is nothing to show', () => {
    expect(visit.state().kind).toBe('closed');
  });

  it('when the copy opens and has not caught up with the server yet, then it is still checking', () => {
    open(copy([], MARK));

    expect(visit.state().kind).toBe('checking');
  });

  it('when it is asked to check, then the copy catches up and the summary compares it with the mark of the last visit', async () => {
    const contents = open(copy([payment('payment-1', '2026-11-09', 10000)], MARK));
    contents.set(
      copy(
        [payment('payment-2', '2026-11-11', 30000), payment('payment-1', '2026-11-09', 10000)],
        MARK,
      ),
    );

    await visit.check();

    const state = visit.state();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(state.kind).toBe('ready');
    expect(state.kind === 'ready' && state.seenAt).toBe(MARK.at);
    expect(state.kind === 'ready' && state.changes.payments).toEqual({
      count: 1,
      totalMinor: 30000,
    });
    expect(state.kind === 'ready' && state.changes.otherAdministrators).toEqual([
      { adminId: PAVEL, name: 'Pavel Znamenáček', actions: 1 },
    ]);
  });

  it('when the copy already caught up at this opening, then checking asks the server nothing more', async () => {
    open(copy([], MARK));
    checkedAt.set('2026-11-12T09:29:00Z');

    await visit.check();

    expect(refresh).not.toHaveBeenCalled();
    expect(visit.state().kind).toBe('ready');
  });

  it('when the copy cannot catch up, then the summary says so, and a later check that succeeds shows it', async () => {
    open(copy([], MARK));
    refresh.mockResolvedValueOnce('failed');

    await visit.check();

    expect(visit.state().kind).toBe('failed');

    await visit.check();

    expect(visit.state().kind).toBe('ready');
  });

  it('when the device is offline, then the summary compares what the copy holds without asking the server', async () => {
    offline.set(true);
    open(copy([payment('payment-2', '2026-11-11', 30000)], MARK));

    await visit.check();

    const state = visit.state();
    expect(refresh).not.toHaveBeenCalled();
    expect(state.kind).toBe('ready');
    expect(state.kind === 'ready' && state.changes.payments.count).toBe(1);
    expect(replaced).toHaveLength(1);
  });

  it('when the device is offline and holds no copy yet, then the summary says it could not find out', () => {
    offline.set(true);
    open(null);

    expect(visit.state().kind).toBe('failed');
  });

  it('when the copy caught up but the mark of this opening is not kept yet, then the summary waits for it, so what it shows is what the next visit compares with', async () => {
    open(copy([], MARK));
    checkedAt.set('2026-11-12T09:29:00Z');

    expect(visit.state().kind).toBe('checking');

    await visit.check();

    expect(replaced).toHaveLength(1);
    expect(visit.state().kind).toBe('ready');
  });

  it('when the copy holds no mark yet, then it is the first visit on this device and the check keeps the mark with the ids and the time', async () => {
    open(copy([payment('payment-1', '2026-11-09', 10000)]));
    await visit.check();

    expect(visit.state().kind).toBe('first');
    expect(replaced).toHaveLength(1);
    expect(replaced[0].seen).toEqual({
      at: '2026-11-12T09:30:00.000Z',
      payments: ['payment-1'],
      donors: [],
      receipts: [],
      actions: ['action-1'],
    });
    expect(visit.state().kind).toBe('first');
  });

  it('when the check keeps the mark, then this opening still compares with the mark it opened with, and the next opening with the new one', async () => {
    open(copy([payment('payment-2', '2026-11-11', 30000)], MARK));
    await visit.check();

    const during = visit.state();
    expect(during.kind === 'ready' && during.changes.payments.count).toBe(1);

    open(replaced[0]);
    await visit.check();

    const next = visit.state();
    expect(next.kind === 'ready' && next.seenAt).toBe('2026-11-12T09:30:00.000Z');
    expect(next.kind === 'ready' && next.changes.anything).toBe(false);
  });

  it('when the mark is kept again while the copy did not change, then nothing is written again', async () => {
    open(copy([], MARK));
    await visit.check();

    await visit.keepMark();

    expect(replaced).toHaveLength(1);
  });

  it('when the mark is kept again after the copy changed, then the new mark is written', async () => {
    const contents = open(copy([], MARK));
    await visit.check();

    contents.set(copy([payment('payment-3', '2026-11-12', 5000)], replaced[0].seen as VisitMark));
    await visit.keepMark();

    expect(replaced).toHaveLength(2);
    expect((replaced[1].seen as VisitMark).payments).toEqual(['payment-3']);
  });

  it('when the copy has not caught up yet, then keeping the mark writes nothing', async () => {
    open(copy([], MARK));

    await visit.keepMark();

    expect(replaced).toHaveLength(0);
  });

  it('when this device keeps nothing of the administration, then the summary says so and no mark is written', async () => {
    kept = false;
    open(copy([]));
    await visit.check();

    expect(visit.state().kind).toBe('not-kept');

    await visit.keepMark();

    expect(replaced).toHaveLength(0);
  });

  it('when the summary is closed, then it stays closed for this opening and shows again at the next one', async () => {
    open(copy([], MARK));
    await visit.check();

    visit.dismiss();

    expect(visit.dismissed()).toBe(true);

    open(copy([], MARK));

    expect(visit.dismissed()).toBe(false);
  });

  it('when the stored mark is not one this version reads, then it counts as the first visit', async () => {
    open({ ...copy([]), seen: { at: 5 } });
    await visit.check();

    expect(visit.state().kind).toBe('first');
  });
});
