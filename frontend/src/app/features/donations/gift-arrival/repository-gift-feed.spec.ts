import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subscription, throwError } from 'rxjs';
import { LiveUpdates } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/live-fixtures';
import {
  DonorDonationsRead,
  DonorDonationsRepository,
} from '../device-copy/donor-donations-repository';
import { DonationItem, DonationSummaryResponse } from '../donations-api';
import { RepositoryGiftFeed } from './repository-gift-feed';
import { giftItem as gift } from './testing/gift-feed-fixtures';

const BANK_CHECK = '/api/donations/me/bank-check';

const SUMMARY: DonationSummaryResponse = {
  totalAmountMinor: 0,
  currency: 'CZK',
  count: 0,
  lastReceivedAt: null,
  byYear: [],
  yearlyReceiptsAvailableThrough: 2025,
  receiptsAvailableFrom: 2026,
};

function readOf(items: readonly DonationItem[]): DonorDonationsRead {
  return {
    source: 'server',
    owner: null,
    summary: SUMMARY,
    items,
    at: '2026-11-06T10:00:00Z',
    bankDataAsOf: null,
  };
}

describe('Given the gifts read for the payment panel outside the donor area', () => {
  let held: WritableSignal<DonorDonationsRead | null>;
  let serverGifts: readonly DonationItem[];
  let reads: number;
  let failing: boolean;
  let live: FakeLiveUpdates;
  let http: HttpTestingController;
  let feed: RepositoryGiftFeed;

  beforeEach(() => {
    held = signal(null);
    serverGifts = [gift('earlier')];
    reads = 0;
    failing = false;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RepositoryGiftFeed,
        {
          provide: DonorDonationsRepository,
          useValue: {
            held,
            fresh: (): Observable<DonorDonationsRead> => {
              reads++;
              return failing ? throwError(() => new Error('offline')) : of(readOf(serverGifts));
            },
          },
        },
      ],
    });
    live = TestBed.inject(LiveUpdates) as unknown as FakeLiveUpdates;
    http = TestBed.inject(HttpTestingController);
    feed = TestBed.inject(RepositoryGiftFeed);
  });

  afterEach(() => http.verify());

  it('when nothing was loaded, then the gifts are not known', () => {
    expect(feed.gifts()).toBeNull();
    expect(feed.listedHere).toBe(false);
  });

  it('when the gifts are requested, then they are read fresh, never from a copy that may be stale', () => {
    held.set(readOf([gift('kept-yesterday')]));
    let answered: readonly string[] = [];

    feed.requestGifts().subscribe((items) => (answered = items.map((item) => item.id)));

    expect(reads).toBe(1);
    expect(answered).toEqual(['earlier']);
    expect(feed.gifts()?.map((item) => item.id)).toEqual(['earlier']);
  });

  it('when the read fails, then the request answers nothing and the gifts stay unknown', () => {
    failing = true;
    let answers = 0;

    feed.requestGifts().subscribe(() => answers++);

    expect(answers).toBe(0);
    expect(feed.gifts()).toBeNull();
  });

  describe('when it follows the live changes', () => {
    let following: Subscription;

    beforeEach(() => {
      following = feed.follow().subscribe();
    });

    afterEach(() => following.unsubscribe());

    it('then a change of the gifts reads them again', () => {
      serverGifts = [gift('earlier'), gift('new')];

      live.hint('donations');

      expect(feed.gifts()?.map((item) => item.id)).toEqual(['earlier', 'new']);
    });

    it('then a change of another feed reads nothing', () => {
      live.hint('bank-accounts');

      expect(reads).toBe(0);
    });
  });

  describe('when it asks the bank', () => {
    beforeEach(() => feed.askBank());

    it('then it is asking until the check ends, and a second ask sends nothing', () => {
      feed.askBank();

      expect(feed.asking()).toBe(true);
      http
        .expectOne({ method: 'POST', url: BANK_CHECK })
        .flush({ bankDataAsOf: '2026-11-06T10:00:00Z', checking: false });
      expect(feed.asking()).toBe(false);
    });

    it('then without a live stream the gifts are read once the check ends', () => {
      http
        .expectOne({ method: 'POST', url: BANK_CHECK })
        .flush({ bankDataAsOf: '2026-11-06T10:00:00Z', checking: false });

      expect(reads).toBe(1);
      expect(feed.gifts()?.map((item) => item.id)).toEqual(['earlier']);
    });

    it('then a failed check ends the asking and reads nothing', () => {
      http
        .expectOne({ method: 'POST', url: BANK_CHECK })
        .flush(null, { status: 503, statusText: 'Service Unavailable' });

      expect(feed.asking()).toBe(false);
      expect(reads).toBe(0);
    });
  });

  it('when a live stream is open, then the check reads nothing itself, as the stream tells of a new gift', () => {
    live.connected.set(true);

    feed.askBank();
    http
      .expectOne({ method: 'POST', url: BANK_CHECK })
      .flush({ bankDataAsOf: '2026-11-06T10:00:00Z', checking: false });

    expect(reads).toBe(0);
  });
});
