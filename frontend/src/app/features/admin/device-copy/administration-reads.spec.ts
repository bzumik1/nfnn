import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShownAnswers } from '../../../core/connectivity/shown-answers';
import { firstValueFrom, toArray } from 'rxjs';
import { AdministrationWrites } from '../../../core/admin-writes/administration-writes';
import { Connectivity } from '../../../core/connectivity/connectivity';
import type { AccountStore, CopyContents } from '../../../core/device/store/account-store';
import {
  COPY_CHANNELS,
  type CopyChannel,
  DeviceVault,
  type OpenedCopy,
} from '../../../core/device/store/device-vault';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import {
  AdministrationCopyDownload,
  type AdministrationDownloadOutcome,
} from './administration-copy-download';
import {
  AdministrationReads,
  FORCED_REFRESH_GAP_MS,
  MISMATCH_REPORT_PAUSE_MS,
  RATE_LIMITED_PAUSE_MS,
  REFRESH_AFTER_MS,
} from './administration-reads';
import { everyOfferedYear } from './administration-overview';

class TabChannels {
  private readonly listeners = new Map<string, ((event: Event) => void)[]>();
  readonly posted: { name: string; message: unknown }[] = [];

  readonly factory = (name: string): CopyChannel =>
    ({
      postMessage: (message: unknown) => this.posted.push({ name, message }),
      addEventListener: (_type: string, listener: (event: Event) => void) =>
        this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]),
      close: () => undefined,
    }) as unknown as CopyChannel;

  fromAnotherTab(name: string, message: unknown): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener(new MessageEvent('message', { data: message }));
    }
  }
}

const RECORD = {
  donorId: 'donor-1',
  name: 'Jana Nováková',
  type: 'PERSON',
  variableSymbol: '7700001001',
  companyIdentifier: null,
  address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
  preferredLocale: 'cs',
  registeredAt: '2026-01-15T10:00:00Z',
  erasedAt: null,
};
const PAYMENT = {
  id: 'payment-1',
  version: '0123456789abcdef',
  bankTransactionId: 26000000001,
  bookedOn: '2026-10-01',
  amountMinor: 50000,
  currency: 'CZK',
  variableSymbol: null,
  counterpartyAccount: '1234567/0800',
  counterpartyName: 'NOVAKOVA JANA',
  messageForRecipient: null,
  importedAt: '2026-10-01T12:00:00Z',
  unpairedByAdminAt: null,
  accountVerification: false,
};
const ACCOUNT = {
  donorId: 'donor-1',
  type: 'PERSON',
  name: 'Jana Nováková',
  companyIdentifier: null,
  address: RECORD.address,
  email: 'jana@example.cz',
  variableSymbol: '7700001001',
  preferredLocale: 'cs',
  registeredAt: '2026-01-15T10:00:00Z',
  emailVerified: true,
  administrator: false,
  secondFactorEnabled: false,
  passkeys: 0,
  erasedAt: null,
};
const SERVER_LIST = { year: null, availableYears: [], items: [], total: 0 };
const ERASED_RECORD = {
  ...RECORD,
  donorId: 'donor-2',
  name: 'Vymazaný dárce',
  variableSymbol: '7700001002',
  erasedAt: '2026-09-01T10:00:00Z',
};
const ERASED_GIFT = {
  id: 'donation-2',
  donorId: 'donor-2',
  paymentId: 'payment-2',
  receivedAt: '2026-03-02',
  amountMinor: 20000,
  currency: 'CZK',
  status: 'RECEIVED',
  source: 'BANK',
  purpose: 'GENERAL',
  pairedBy: 'VARIABLE_SYMBOL',
  bankAccountId: null,
  symbolClaimId: null,
  recordedAt: '2026-03-02T12:00:00Z',
};
const ERASED_PAYMENT = {
  ...PAYMENT,
  id: 'payment-2',
  bankTransactionId: 26000000002,
  bookedOn: '2026-03-02',
  amountMinor: 20000,
  counterpartyAccount: null,
  counterpartyName: null,
  importedAt: '2026-03-02T12:00:00Z',
};
const PAYMENT_2025 = {
  ...PAYMENT,
  id: 'payment-3',
  bankTransactionId: 25000000003,
  bookedOn: '2025-11-03',
  importedAt: '2025-11-03T12:00:00Z',
};
const GIFT_2025 = {
  ...ERASED_GIFT,
  id: 'donation-3',
  donorId: 'donor-1',
  paymentId: 'payment-3',
  receivedAt: '2025-11-03',
  amountMinor: 50000,
  recordedAt: '2025-11-03T12:00:00Z',
};
const BANK_ACCOUNT = { id: 'link-1', accountNumber: '1234567/0800', version: 'abcdef0123456789' };

function contents(
  summary: object = { today: '2026-10-20', byYear: [], receiptsAvailableFrom: 2026 },
): CopyContents {
  return {
    chunks: [
      { id: 'donations/payments:2026-10', rowsSha256: 'a', rows: [PAYMENT] },
      { id: 'donations/donor-records:2026-01', rowsSha256: 'b', rows: [RECORD] },
      { id: 'donors/accounts:2026-01', rowsSha256: 'c', rows: [ACCOUNT] },
    ],
    summary: { donations: summary },
    storedAt: '2026-10-20T08:00:00.000Z',
  };
}

describe('Given the administration pages reading through the copy on this device', () => {
  let http: HttpTestingController;
  let reads: AdministrationReads;
  let opened: ReturnType<typeof signal<OpenedCopy | null>>;
  let offline: ReturnType<typeof signal<boolean>>;
  let refresh: ReturnType<
    typeof vi.fn<(startingNow?: boolean) => Promise<AdministrationDownloadOutcome>>
  >;
  let writesAtStart: ReturnType<typeof vi.fn<() => number | null>>;
  let tabs: TabChannels;
  let reporter: { report: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T09:00:00Z') });
    opened = signal<OpenedCopy | null>(null);
    offline = signal(false);
    refresh = vi
      .fn<(startingNow?: boolean) => Promise<AdministrationDownloadOutcome>>()
      .mockResolvedValue('unchanged');
    writesAtStart = vi.fn<() => number | null>().mockReturnValue(null);
    tabs = new TabChannels();
    reporter = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DeviceVault, useValue: { administration: opened.asReadonly() } },
        { provide: Connectivity, useValue: { offline: offline.asReadonly() } },
        {
          provide: AdministrationCopyDownload,
          useValue: {
            refresh,
            checkedAt: signal<string | null>(null).asReadonly(),
            writesAtStart,
          },
        },
        { provide: COPY_CHANNELS, useValue: tabs.factory },
        { provide: ErrorReporter, useValue: reporter },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    reads = TestBed.inject(AdministrationReads);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function withErasedDonor(held: CopyContents): CopyContents {
    return {
      ...held,
      chunks: [
        ...held.chunks,
        { id: 'donations/donor-records:2026-02', rowsSha256: 'd', rows: [ERASED_RECORD] },
        { id: 'donations/donations:2025-11', rowsSha256: 'f', rows: [GIFT_2025] },
        { id: 'donations/donations:2026-03', rowsSha256: 'e', rows: [ERASED_GIFT] },
        { id: 'donations/payments:2025-11', rowsSha256: 'g', rows: [PAYMENT_2025] },
        { id: 'donations/payments:2026-03', rowsSha256: 'h', rows: [ERASED_PAYMENT] },
      ],
    };
  }

  function open(held: CopyContents, copyId = 'copy-1'): void {
    openWith(signal(held), copyId);
  }

  function openWith(held: ReturnType<typeof signal<CopyContents>>, copyId = 'copy-1'): void {
    const store = {
      copyId,
      contents: held.asReadonly(),
    } as unknown as AccountStore;
    opened.set({
      store,
      reason: 'unlocked',
      account: { email: 'a@example.cz', userHandle: 'h', administrator: true },
    });
  }

  describe('when no copy is open', () => {
    it('then the payments come from the server and nothing is refreshed', async () => {
      const answer = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );

      expect(await answer).toEqual(SERVER_LIST);
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('when a copy is open and online', () => {
    beforeEach(() => open(contents()));

    it('then the payments are computed from the copy after one refresh, and a second read within a minute refreshes nothing', async () => {
      const first = await firstValueFrom(reads.paymentList('unpaired'));
      const second = await firstValueFrom(reads.donorSearch('nov'));

      expect(first.items.map((item) => item.id)).toEqual(['payment-1']);
      expect(second.items.map((item) => item.donorId)).toEqual(['donor-1']);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('and a minute passed, then the copy is refreshed again, and the server answers when that refresh fails', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      vi.setSystemTime(Date.now() + REFRESH_AFTER_MS);
      refresh.mockResolvedValue('failed');

      const answer = firstValueFrom(reads.accountList('jana'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donors')
          .flush({ items: [], hasMore: false }),
      );

      expect(refresh).toHaveBeenCalledTimes(2);
      expect((await answer).items).toEqual([]);
    });

    it('then an answer from the copy tells the offline label the time of the copy', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));

      expect(TestBed.inject(ShownAnswers).oldest()).toBe(Date.parse('2026-10-20T08:00:00.000Z'));
    });

    it('and something changed after the last refresh started at least half a minute ago, then the copy is refreshed at once, and the server answers when that refresh fails', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      vi.setSystemTime(Date.now() + FORCED_REFRESH_GAP_MS);
      reads.changed();
      refresh.mockResolvedValue('failed');

      const answer = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );

      expect(await answer).toEqual(SERVER_LIST);
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('and a refresh after a change failed, then the server answers for a minute without another refresh, and the copy is refreshed again after it', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      vi.setSystemTime(Date.now() + FORCED_REFRESH_GAP_MS);
      reads.changed();
      refresh.mockResolvedValue('failed');
      for (const attempt of [1, 2]) {
        const answer = firstValueFrom(reads.paymentList('unpaired'));
        await vi.waitFor(() =>
          http
            .expectOne((request) => request.url === '/api/admin/donations/payments')
            .flush(SERVER_LIST),
        );
        expect(await answer, `attempt ${attempt}`).toEqual(SERVER_LIST);
      }
      expect(refresh).toHaveBeenCalledTimes(2);

      vi.setSystemTime(Date.now() + REFRESH_AFTER_MS);
      refresh.mockResolvedValue('unchanged');
      const fromCopy = await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh).toHaveBeenCalledTimes(3);
      expect(fromCopy.items.map((item) => item.id)).toEqual(['payment-1']);
    });

    it('and something changed less than half a minute after the last refresh started, then the server answers without a refresh, and the copy is refreshed once the half minute is over', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      reads.changed();

      const answer = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );
      expect(await answer).toEqual(SERVER_LIST);
      expect(refresh).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + FORCED_REFRESH_GAP_MS);
      const fromCopy = await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh.mock.calls).toEqual([[false], [true]]);
      expect(fromCopy.items.map((item) => item.id)).toEqual(['payment-1']);
    });

    it('and the server refused a refresh as too many, then the server answers for five minutes without another refresh, the other tabs are told, and the copy is refreshed after them', async () => {
      refresh.mockResolvedValue('rate-limited');
      const refusedFrom = Date.now();
      const refused = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );
      expect(await refused).toEqual(SERVER_LIST);
      expect(tabs.posted).toEqual([
        {
          name: 'nfnn.administration-checks',
          message: {
            copyId: 'copy-1',
            storedAt: '2026-10-20T08:00:00.000Z',
            kind: 'rate-limited',
            at: expect.any(Number),
          },
        },
      ]);
      expect((tabs.posted[0].message as { at: number }).at).toBeGreaterThanOrEqual(
        refusedFrom + RATE_LIMITED_PAUSE_MS,
      );

      vi.setSystemTime(Date.now() + REFRESH_AFTER_MS);
      const stillPaused = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );
      expect(await stillPaused).toEqual(SERVER_LIST);
      expect(refresh).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + RATE_LIMITED_PAUSE_MS - REFRESH_AFTER_MS);
      refresh.mockResolvedValue('unchanged');
      const fromCopy = await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh).toHaveBeenCalledTimes(2);
      expect(fromCopy.items.map((item) => item.id)).toEqual(['payment-1']);
    });

    it('and another tab found the same copy unchanged, then this tab reads the copy for a minute without a refresh of its own, but a change made here still refreshes it', async () => {
      tabs.fromAnotherTab('nfnn.administration-checks', {
        copyId: 'copy-1',
        storedAt: '2026-10-20T08:00:00.000Z',
        kind: 'checked',
        at: Date.now(),
      });

      await firstValueFrom(reads.paymentList('unpaired'));
      expect(refresh).not.toHaveBeenCalled();

      reads.changed();
      await firstValueFrom(reads.paymentList('unpaired'));
      expect(refresh.mock.calls).toEqual([[true]]);
    });

    it('and the server refused a refresh as too many and then another copy opens, then the new copy is refreshed at once', async () => {
      refresh.mockResolvedValue('rate-limited');
      const refused = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );
      await refused;

      open(contents(), 'copy-2');
      refresh.mockResolvedValue('unchanged');
      const fromCopy = await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh).toHaveBeenCalledTimes(2);
      expect(fromCopy.items.map((item) => item.id)).toEqual(['payment-1']);
    });

    it('and another tab tells of a check or a pause far in the future, then this tab trusts it only as far as now and five minutes from now', async () => {
      tabs.fromAnotherTab('nfnn.administration-checks', {
        copyId: 'copy-1',
        storedAt: '2026-10-20T08:00:00.000Z',
        kind: 'checked',
        at: Date.now() + 24 * 60 * 60_000,
      });
      await firstValueFrom(reads.paymentList('unpaired'));
      expect(refresh).not.toHaveBeenCalled();

      vi.setSystemTime(Date.now() + REFRESH_AFTER_MS);
      await firstValueFrom(reads.paymentList('unpaired'));
      expect(refresh).toHaveBeenCalledTimes(1);

      tabs.fromAnotherTab('nfnn.administration-checks', {
        copyId: 'copy-1',
        storedAt: null,
        kind: 'rate-limited',
        at: Date.now() + 24 * 60 * 60_000,
      });
      vi.setSystemTime(Date.now() + RATE_LIMITED_PAUSE_MS);
      await firstValueFrom(reads.paymentList('unpaired'));
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('and another tab was refused as too many, then this tab asks the server instead of refreshing', async () => {
      tabs.fromAnotherTab('nfnn.administration-checks', {
        copyId: 'copy-1',
        storedAt: null,
        kind: 'rate-limited',
        at: Date.now() + RATE_LIMITED_PAUSE_MS,
      });

      const answer = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );

      expect(await answer).toEqual(SERVER_LIST);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('then a check that found the copy unchanged is told to the other tabs, and one that stored a new copy is not, as their copy reloads by itself', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      vi.setSystemTime(Date.now() + REFRESH_AFTER_MS);
      refresh.mockResolvedValue('stored');
      await firstValueFrom(reads.paymentList('unpaired'));

      expect(tabs.posted).toEqual([
        {
          name: 'nfnn.administration-checks',
          message: {
            copyId: 'copy-1',
            storedAt: '2026-10-20T08:00:00.000Z',
            kind: 'checked',
            at: Date.now() - REFRESH_AFTER_MS,
          },
        },
      ]);
    });

    it('and another tab tells of another copy or sends something else, then this tab takes no notice', async () => {
      for (const message of [
        { copyId: 'copy-9', storedAt: '2026-10-20T08:00:00.000Z', kind: 'checked', at: Date.now() },
        { copyId: 'copy-1', storedAt: '2026-10-19T08:00:00.000Z', kind: 'checked', at: Date.now() },
        { copyId: 'copy-1', kind: 'checked', at: Date.now() },
        { copyId: 'copy-1', storedAt: '2026-10-20T08:00:00.000Z', kind: 'deleted', at: Date.now() },
        { copyId: 'copy-1', storedAt: '2026-10-20T08:00:00.000Z', kind: 'checked', at: 'now' },
        null,
      ]) {
        tabs.fromAnotherTab('nfnn.administration-checks', message);
      }

      await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('and the account is not in the copy, then the server is asked for it', async () => {
      const answer = firstValueFrom(reads.account('donor-9'));
      await vi.waitFor(() =>
        http.expectOne('/api/admin/donors/donor-9').flush({ ...ACCOUNT, donorId: 'donor-9' }),
      );

      expect((await answer).donorId).toBe('donor-9');
    });

    it('then a donor card shows the copy at once without bank accounts, and then with the bank accounts of the server', async () => {
      const cards = firstValueFrom(reads.donorCard('donor-1').pipe(toArray()));
      await vi.waitFor(() =>
        http.expectOne('/api/admin/donations/donors/donor-1').flush({
          donor: RECORD,
          yearlyReceiptsAvailableThrough: 2025,
          bankAccounts: [BANK_ACCOUNT],
        }),
      );

      const [held, completed] = await cards;
      expect(held.bankAccounts).toBe('pending');
      expect(held.detail.donor.name).toBe('Jana Nováková');
      expect(held.detail.bankAccounts).toEqual([]);
      expect(held.detail.yearlyReceiptsAvailableThrough).toBe(2025);
      expect(completed).toEqual({
        detail: {
          donor: RECORD,
          yearlyReceiptsAvailableThrough: 2025,
          bankAccounts: [BANK_ACCOUNT],
        },
        bankAccounts: 'server',
      });
    });

    it('and something changed, then the refresh asked for is one that starts after the change, and a change during that refresh asks for another', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      expect(refresh).toHaveBeenLastCalledWith(false);
      vi.setSystemTime(Date.now() + FORCED_REFRESH_GAP_MS);
      reads.changed();
      let finish: (outcome: AdministrationDownloadOutcome) => void = () => undefined;
      refresh.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

      const duringRefresh = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
      reads.changed();
      finish('unchanged');
      await duringRefresh;
      vi.setSystemTime(Date.now() + FORCED_REFRESH_GAP_MS);
      await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh.mock.calls).toEqual([[false], [true], [true]]);
    });

    it('and any administration write succeeded since, then the next read asks for a refresh that starts after it', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      vi.setSystemTime(Date.now() + FORCED_REFRESH_GAP_MS);
      TestBed.inject(AdministrationWrites).record();

      await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh.mock.calls).toEqual([[false], [true]]);
    });

    it('and another copy opens while a refresh of the first one runs, then that refresh confirms nothing and the server answers', async () => {
      let finish: (outcome: AdministrationDownloadOutcome) => void = () => undefined;
      refresh.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
      const answer = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      open(contents(), 'copy-2');
      finish('unchanged');
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );

      expect(await answer).toEqual(SERVER_LIST);
    });

    it('and another copy opens after a change, then its first read refreshes it again and joins the download the opening started', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      reads.changed();
      open(contents(), 'copy-2');

      await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh.mock.calls).toEqual([[false], [false]]);
    });

    it("and the server cannot give the bank accounts, then the card stays the copy's and says loading them failed", async () => {
      const cards = firstValueFrom(reads.donorCard('donor-1').pipe(toArray()));
      await vi.waitFor(() =>
        http
          .expectOne('/api/admin/donations/donors/donor-1')
          .flush(null, { status: 500, statusText: 'Error' }),
      );

      expect((await cards).map((card) => card.bankAccounts)).toEqual(['pending', 'failed']);
    });

    it('and the server is unreachable for the bank accounts, then the card says they come once the device is online', async () => {
      const cards = firstValueFrom(reads.donorCard('donor-1').pipe(toArray()));
      await vi.waitFor(() =>
        http
          .expectOne('/api/admin/donations/donors/donor-1')
          .flush(null, { status: 503, statusText: 'Unavailable' }),
      );

      expect((await cards).map((card) => card.bankAccounts)).toEqual(['pending', 'offline']);
    });
  });

  describe('when a copy is open and the device is offline', () => {
    beforeEach(() => {
      open(contents());
      offline.set(true);
    });

    it('then nothing is refreshed, the offline label gets the time of the copy, and a donor card comes without bank accounts', async () => {
      const cards = await firstValueFrom(reads.donorCard('donor-1').pipe(toArray()));

      expect(refresh).not.toHaveBeenCalled();
      expect(TestBed.inject(ShownAnswers).oldest()).toBe(Date.parse('2026-10-20T08:00:00.000Z'));
      expect(cards.map((card) => card.bankAccounts)).toEqual(['offline']);
    });
  });

  describe('when the copy holds an erased donor, whose receipts and payer details stay off devices', () => {
    beforeEach(() => open(withErasedDonor(contents())));

    it('then online the paired payments that list the erased donor gift and the erased donor card come from the server, the unpaired payments from the copy', async () => {
      const paired = firstValueFrom(reads.paymentList('paired'));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );
      const card = firstValueFrom(reads.donorCard('donor-2').pipe(toArray()));
      await vi.waitFor(() =>
        http
          .expectOne('/api/admin/donations/donors/donor-2')
          .flush({ donor: ERASED_RECORD, bankAccounts: [] }),
      );
      const unpaired = await firstValueFrom(reads.paymentList('unpaired'));

      expect(await paired).toEqual(SERVER_LIST);
      expect((await card).map((read) => read.bankAccounts)).toEqual(['server']);
      expect(unpaired.items.map((item) => item.id)).toEqual(['payment-1']);
    });

    it('then online a paired list without the erased donor gift comes from the copy, also when a text is searched within it, and a text over every year asks the server', async () => {
      const ofYear = await firstValueFrom(reads.paymentList('paired', { year: 2025 }));
      const searchedInYear = await firstValueFrom(
        reads.paymentList('paired', { year: 2025, text: 'nov' }),
      );
      const searchedEverywhere = firstValueFrom(reads.paymentList('paired', { text: 'nov' }));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );

      expect(ofYear.items.map((item) => item.id)).toEqual(['payment-3']);
      expect(searchedInYear.items.map((item) => item.id)).toEqual(['payment-3']);
      expect(await searchedEverywhere).toEqual(SERVER_LIST);
    });

    it('then online a text the server does not count as blank, such as a no-break space, asks the server, as it searches every payment the other filters keep', async () => {
      const searched = firstValueFrom(reads.paymentList('paired', { text: '\u00a0' }));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/payments')
          .flush(SERVER_LIST),
      );

      expect(await searched).toEqual(SERVER_LIST);
    });

    it('and the device is offline, then the paired payments come from the copy as it holds them, the erased donor gift without its payer and without a receipt', async () => {
      offline.set(true);

      const paired = await firstValueFrom(reads.paymentList('paired', { year: 2026 }));

      expect(paired.items).toHaveLength(1);
      expect(paired.items[0]).toMatchObject({
        id: 'payment-2',
        counterpartyAccount: null,
        counterpartyName: null,
        donation: { donorId: 'donor-2', donorName: 'Vymazaný dárce', receiptIssued: false },
      });
    });
  });

  describe('when an administration write was made while the download at the opening ran, before any page read the copy', () => {
    it('then the first read asks for a refresh that starts after the write instead of joining that older download', async () => {
      writesAtStart.mockReturnValue(0);
      TestBed.inject(AdministrationWrites).record();
      open(contents());

      await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh.mock.calls).toEqual([[true]]);
    });
  });

  describe('when the administration reads its year overview', () => {
    function heldWith(summary: (byYear: readonly object[]) => readonly object[]): CopyContents {
      const held = withErasedDonor(contents());
      const rows = {
        payments: [PAYMENT, PAYMENT_2025, ERASED_PAYMENT],
        donations: [GIFT_2025, ERASED_GIFT],
        donorRecords: [RECORD, ERASED_RECORD],
      };
      const byYear = everyOfferedYear(rows as never, '2026-10-20');
      return {
        ...held,
        summary: {
          donations: { today: '2026-10-20', receiptsAvailableFrom: 2026, byYear: summary(byYear) },
        },
      };
    }

    it('and no copy is open, then the server answers it', async () => {
      const answer = firstValueFrom(reads.overview(2025));
      await vi.waitFor(() =>
        http
          .expectOne(
            (request) =>
              request.url === '/api/admin/donations/overview' &&
              request.params.get('year') === '2025',
          )
          .flush({ year: 2025 }),
      );

      expect(await answer).toEqual({ year: 2025 });
    });

    it('and the copy agrees with the summary of the server, then the overview of the asked year comes from the copy, offered years included', async () => {
      open(heldWith((byYear) => byYear));

      const latest = await firstValueFrom(reads.overview());
      const earlier = await firstValueFrom(reads.overview(2025));

      expect(latest.year).toBe(2026);
      expect(latest.availableYears).toEqual([2026, 2025]);
      expect(latest.paired).toEqual({ count: 1, totalMinor: 20000, currency: 'CZK' });
      expect(latest.unpaired).toEqual({ count: 1, totalMinor: 50000, currency: 'CZK' });
      expect(latest.months.map((month) => month.month)[0]).toBe('2026-10');
      expect(earlier.year).toBe(2025);
      expect(earlier.received).toEqual({ count: 1, totalMinor: 50000, currency: 'CZK' });
      expect(reporter.report).not.toHaveBeenCalled();
    });

    it('and the device is offline, then the overview comes from the copy and the offline label gets the time of the copy', async () => {
      open(heldWith((byYear) => byYear));
      offline.set(true);

      const overview = await firstValueFrom(reads.overview());

      expect(overview.year).toBe(2026);
      expect(refresh).not.toHaveBeenCalled();
      expect(TestBed.inject(ShownAnswers).oldest()).toBe(Date.parse('2026-10-20T08:00:00.000Z'));
    });

    it('and what the copy computes differs from the summary of the server, then the server answers, the difference is reported once, and the copy is not used', async () => {
      open(
        heldWith((byYear) =>
          byYear.map((entry, index) => (index === 0 ? { ...entry, newDonors: 7 } : entry)),
        ),
      );

      for (const attempt of [1, 2]) {
        const answer = firstValueFrom(reads.overview());
        await vi.waitFor(() =>
          http
            .expectOne((request) => request.url === '/api/admin/donations/overview')
            .flush({ year: 2026 }),
        );
        expect(await answer, `attempt ${attempt}`).toEqual({ year: 2026 });
      }

      expect(reporter.report).toHaveBeenCalledTimes(1);
      expect(reporter.report).toHaveBeenCalledWith('device-copy-mismatch', 'global');
    });

    it('and the summary of the server carries a field the copy does not compute, then the copy still agrees and answers', async () => {
      open(
        heldWith((byYear) =>
          byYear.map((entry) => ({
            ...entry,
            refunded: { count: 0, totalMinor: 0, currency: 'CZK' },
            months: (entry as { months: readonly object[] }).months.map((month) => ({
              ...month,
              refunded: 0,
            })),
          })),
        ),
      );

      const overview = await firstValueFrom(reads.overview());

      expect(overview.year).toBe(2026);
      expect(overview).not.toHaveProperty('refunded');
      expect(reporter.report).not.toHaveBeenCalled();
    });

    it('and the copy differs from the summary again after an hour with other contents, then the difference is reported again, but not sooner', async () => {
      const differing = heldWith((byYear) =>
        byYear.map((entry, index) => (index === 0 ? { ...entry, newDonors: 7 } : entry)),
      );
      const held = signal<CopyContents>(differing);
      openWith(held);
      const serverAnswers = async () => {
        const answer = firstValueFrom(reads.overview());
        await vi.waitFor(() =>
          http
            .expectOne((request) => request.url === '/api/admin/donations/overview')
            .flush({ year: 2026 }),
        );
        await answer;
      };

      await serverAnswers();
      held.set({ ...differing, storedAt: '2026-10-20T08:30:00.000Z' });
      await serverAnswers();
      expect(reporter.report).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + MISMATCH_REPORT_PAUSE_MS);
      held.set({ ...differing, storedAt: '2026-10-20T09:30:00.000Z' });
      await serverAnswers();
      expect(reporter.report).toHaveBeenCalledTimes(2);
    });

    it('and the copy holds no summary, then the server answers', async () => {
      open({ ...contents(), summary: { donations: null } });

      const answer = firstValueFrom(reads.overview());
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donations/overview')
          .flush({ year: 2026 }),
      );

      expect(await answer).toEqual({ year: 2026 });
    });
  });

  describe('when the administration reads the state of the bank import', () => {
    const STORED = {
      coveredFrom: '2026-07-20',
      coveredTo: '2026-10-17',
      lastAttemptedAt: '2026-10-18T10:00:00Z',
      lastSucceededAt: '2026-10-17T10:00:00Z',
      lastFailure: { kind: 'UNAUTHORIZED', attemptedAt: '2026-10-18T10:00:00Z' },
      consecutiveFailures: 1,
      reportedOutage: 'UNAUTHORIZED',
      balance: null,
    };
    const SERVER_STATE = {
      ...STORED,
      lastFailure: { ...STORED.lastFailure, message: 'Token není platný' },
      historyImport: null,
      defaultHistoryFrom: '2026-01-01',
    };

    function withImportState(): CopyContents {
      const held = contents();
      return {
        ...held,
        chunks: [...held.chunks, { id: 'donations/import-state', rowsSha256: 'i', rows: [STORED] }],
      };
    }

    it('and the device is online, then the server answers it, the run of older payments included, although a copy is open', async () => {
      open(withImportState());

      const answer = firstValueFrom(reads.importState());
      http.expectOne('/api/admin/donations/import-state').flush(SERVER_STATE);

      expect(await answer).toEqual({ source: 'server', state: SERVER_STATE });
      expect(refresh).not.toHaveBeenCalled();
    });

    it('and the device is offline, then the copy answers it with the kind and time of the failure and without its text', async () => {
      open(withImportState());
      offline.set(true);

      const read = await firstValueFrom(reads.importState());

      expect(read).toEqual({
        source: 'copy',
        state: {
          ...STORED,
          lastFailure: { kind: 'UNAUTHORIZED', message: null, attemptedAt: '2026-10-18T10:00:00Z' },
        },
      });
      expect(TestBed.inject(ShownAnswers).oldest()).toBe(Date.parse('2026-10-20T08:00:00.000Z'));
    });

    it("and the copy was stored before its rows left out the failure's text, then the copy still answers without it", async () => {
      const held = contents();
      open({
        ...held,
        chunks: [
          ...held.chunks,
          {
            id: 'donations/import-state',
            rowsSha256: 'i',
            rows: [
              { ...STORED, lastFailure: { ...STORED.lastFailure, message: 'Token není platný' } },
            ],
          },
        ],
      });
      offline.set(true);

      const read = await firstValueFrom(reads.importState());

      expect(read.state.lastFailure?.message).toBeNull();
    });

    it('and the server cannot be reached, then the copy answers it', async () => {
      open(withImportState());

      const answer = firstValueFrom(reads.importState());
      http
        .expectOne('/api/admin/donations/import-state')
        .flush(null, { status: 503, statusText: 'Unavailable' });

      expect((await answer).source).toBe('copy');
    });

    it('and the server refuses it, or the copy holds no import state, then the failure reaches the page', async () => {
      open(withImportState());
      const refused = firstValueFrom(reads.importState());
      http
        .expectOne('/api/admin/donations/import-state')
        .flush(null, { status: 500, statusText: 'Error' });
      await expect(refused).rejects.toBeTruthy();

      open(contents(), 'copy-2');
      const unreachable = firstValueFrom(reads.importState());
      http
        .expectOne('/api/admin/donations/import-state')
        .flush(null, { status: 503, statusText: 'Unavailable' });
      await expect(unreachable).rejects.toBeTruthy();
    });
  });

  describe('when the copy was stored before the server named the first receipt year', () => {
    it('then the donor card comes from the server', async () => {
      open(contents({ today: '2026-10-20', byYear: [] }));
      const cards = firstValueFrom(reads.donorCard('donor-1').pipe(toArray()));
      await vi.waitFor(() =>
        http
          .expectOne('/api/admin/donations/donors/donor-1')
          .flush({ donor: RECORD, bankAccounts: [] }),
      );

      expect((await cards).map((card) => card.bankAccounts)).toEqual(['server']);
    });
  });
});
