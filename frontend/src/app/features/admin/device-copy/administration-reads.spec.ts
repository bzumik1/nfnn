import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, toArray } from 'rxjs';
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
  let refresh: ReturnType<typeof vi.fn<() => Promise<AdministrationDownloadOutcome>>>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T09:00:00Z') });
    opened = signal<OpenedCopy | null>(null);
    offline = signal(false);
    refresh = vi.fn<() => Promise<AdministrationDownloadOutcome>>().mockResolvedValue('unchanged');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
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

  function open(held: CopyContents): void {
    const store = {
      copyId: 'copy-1',
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

    it('and a minute passed, then the copy is refreshed again, and kept when that refresh fails', async () => {
      await firstValueFrom(reads.paymentList('unpaired'));
      vi.setSystemTime(Date.now() + REFRESH_AFTER_MS);
      refresh.mockResolvedValue('failed');

      const answer = await firstValueFrom(reads.accountList('jana'));

      expect(refresh).toHaveBeenCalledTimes(2);
      expect(answer.items.map((item) => item.email)).toEqual(['jana@example.cz']);
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
        http
          .expectOne('/api/admin/donations/donors/donor-1')
          .flush({ bankAccounts: [BANK_ACCOUNT] }),
      );

      const [held, completed] = await cards;
      expect(held.bankAccounts).toBe('pending');
      expect(held.detail.donor.name).toBe('Jana Nováková');
      expect(held.detail.bankAccounts).toEqual([]);
      expect(completed.bankAccounts).toBe('server');
      expect(completed.detail.bankAccounts).toEqual([BANK_ACCOUNT]);
      expect(completed.detail.yearlyReceiptsAvailableThrough).toBe(2025);
    });

    it("and the server cannot give the bank accounts, then the card stays the copy's and says the bank accounts are unavailable", async () => {
      const cards = firstValueFrom(reads.donorCard('donor-1').pipe(toArray()));
      await vi.waitFor(() =>
        http
          .expectOne('/api/admin/donations/donors/donor-1')
          .flush(null, { status: 503, statusText: 'Unavailable' }),
      );

      expect((await cards).map((card) => card.bankAccounts)).toEqual(['pending', 'unavailable']);
    });
  });

  describe('when a copy is open and the device is offline', () => {
    beforeEach(() => {
      open(contents());
      offline.set(true);
    });

    it('then nothing is refreshed, the pages say they show the copy, and a donor card comes without bank accounts', async () => {
      const cards = await firstValueFrom(reads.donorCard('donor-1').pipe(toArray()));

      expect(refresh).not.toHaveBeenCalled();
      expect(reads.fromCopyOffline()).toBe(true);
      expect(reads.copyTime()).toBe('2026-10-20T08:00:00.000Z');
      expect(cards.map((card) => card.bankAccounts)).toEqual(['unavailable']);
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
