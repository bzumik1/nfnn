import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { DonationListResponse } from '../donations-api';
import { donationItem, twoYearDonations, twoYearSummary } from '../testing/donation-fixtures';
import { DonorCopyLink } from './donor-copy';
import { type DonorDonationsRead, DonorDonationsRepository } from './donor-donations-repository';
import { COPY_STORED_AT, copyViewOf, FakeDonorCopy } from './testing/fake-donor-copy';

const NEW_GIFT = donationItem({ id: 'd-9', receivedAt: '2026-04-02', amountMinor: 30000 });

function withNewGift(): DonationListResponse {
  const list = twoYearDonations();
  return { ...list, items: [NEW_GIFT, ...list.items], count: list.count + 1 };
}

describe('Given the repository the donor pages read their gifts from', () => {
  let http: HttpTestingController;
  let repository: DonorDonationsRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(DonorDonationsRepository);
  });

  afterEach(() => http.verify());

  async function answerServer(list: DonationListResponse = twoYearDonations()): Promise<void> {
    await Promise.resolve();
    http.expectOne('/api/donations/me/summary').flush(twoYearSummary());
    http.expectOne('/api/donations/me').flush(list);
  }

  it('when no copy is open on this device, then nothing is held and the gifts come from the server', async () => {
    expect(repository.held()).toBeNull();

    const read = firstValueFrom(repository.fresh('sync'));
    await answerServer();

    expect(await read).toMatchObject({ source: 'server', items: twoYearDonations().items });
  });

  describe('when a copy is open', () => {
    let copy: FakeDonorCopy;

    beforeEach(() => {
      copy = new FakeDonorCopy();
      TestBed.inject(DonorCopyLink).copy.set(copy);
    });

    it('and holds the gifts, then they are held as of when the copy stored them', () => {
      copy.shown.set(copyViewOf(twoYearSummary(), twoYearDonations()));

      expect(repository.held()).toEqual<DonorDonationsRead>({
        source: 'copy',
        summary: copyViewOf(twoYearSummary(), twoYearDonations()).summary,
        items: twoYearDonations().items,
        at: COPY_STORED_AT,
        bankDataAsOf: '2026-10-18T08:05:30Z',
      });
    });

    it('and its gifts disagree with its summary, then nothing is held', () => {
      copy.shown.set({ ...copyViewOf(twoYearSummary(), twoYearDonations()), agrees: false });

      expect(repository.held()).toBeNull();
      expect(repository.view()).toBeNull();
    });

    it('and it is still empty, then the gifts come from the server while the copy only catches up', async () => {
      const read = firstValueFrom(repository.fresh('sync'));
      await answerServer();

      expect(await read).toMatchObject({ source: 'server' });
      expect(copy.catchUp).toHaveBeenCalledTimes(1);
      expect(copy.sync).not.toHaveBeenCalled();
    });

    for (const freshness of ['sync', 'catch-up'] as const) {
      it(`and a ${freshness} stores it, then the gifts come from the copy and the server is not asked`, async () => {
        copy.shown.set(copyViewOf(twoYearSummary(), twoYearDonations()));

        const read = firstValueFrom(repository.fresh(freshness));
        copy.finish('stored', copyViewOf(twoYearSummary(), withNewGift()));

        expect(await read).toMatchObject({ source: 'copy', items: withNewGift().items });
        expect((freshness === 'sync' ? copy.sync : copy.catchUp).mock.calls.length).toBe(1);
        http.expectNone('/api/donations/me');
      });
    }

    for (const outcome of ['failed', 'mismatch', 'no-copy'] as const) {
      it(`and the sync ends as ${outcome}, then the gifts come from the server, so a failure there is seen`, async () => {
        copy.shown.set(copyViewOf(twoYearSummary(), twoYearDonations()));

        const read = firstValueFrom(repository.fresh('sync'));
        copy.finish(outcome);
        await answerServer(withNewGift());

        expect(await read).toMatchObject({ source: 'server', items: withNewGift().items });
      });
    }

    it('and the copy closes, then nothing is held', () => {
      copy.shown.set(copyViewOf(twoYearSummary(), twoYearDonations()));
      copy.opened.set(false);

      expect(repository.held()).toBeNull();
    });
  });
});
