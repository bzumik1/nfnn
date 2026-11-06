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
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import {
  AdministrationCopyDownload,
  type AdministrationDownloadOutcome,
} from './administration-copy-download';
import { AdministrationReads, REFRESH_AFTER_MS } from './administration-reads';

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

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T09:00:00Z') });
    opened = signal<OpenedCopy | null>(null);
    offline = signal(false);
    refresh = vi
      .fn<(startingNow?: boolean) => Promise<AdministrationDownloadOutcome>>()
      .mockResolvedValue('unchanged');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DeviceVault, useValue: { administration: opened.asReadonly() } },
        { provide: Connectivity, useValue: { offline: offline.asReadonly() } },
        {
          provide: AdministrationCopyDownload,
          useValue: { refresh, checkedAt: signal<string | null>(null).asReadonly() },
        },
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
    const store = {
      copyId,
      contents: signal(held).asReadonly(),
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

    it('and something changed, then the copy is refreshed at once, and the server answers when that refresh fails', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
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
      reads.changed();
      let finish: (outcome: AdministrationDownloadOutcome) => void = () => undefined;
      refresh.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

      const duringRefresh = firstValueFrom(reads.paymentList('unpaired'));
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
      reads.changed();
      finish('unchanged');
      await duringRefresh;
      await firstValueFrom(reads.paymentList('unpaired'));

      expect(refresh.mock.calls).toEqual([[false], [true], [true]]);
    });

    it('and any administration write succeeded since, then the next read asks for a refresh that starts after it', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
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
