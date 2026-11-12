import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../../core/auth/auth-store';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { GIFT_FEED } from './gift-feed';
import {
  GIFT_CHECK_OFFSETS_MS,
  GIFT_WATCH_MAX_CHECKS,
  GIFT_WATCH_MS,
  GiftArrivalWatch,
  QR_DWELL_MS,
} from './gift-arrival-watch';
import { FakeGiftFeed, giftItem as gift } from './testing/gift-feed-fixtures';

type Sighting = (
  entries: Pick<IntersectionObserverEntry, 'target' | 'isIntersecting' | 'intersectionRatio'>[],
) => void;

class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;

  constructor(readonly sighting: Sighting) {
    FakeIntersectionObserver.all.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  static show(element: Element, isIntersecting: boolean): void {
    for (const observer of FakeIntersectionObserver.all) {
      if (observer.observed.includes(element) && !observer.disconnected) {
        observer.sighting([
          { target: element, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 },
        ]);
      }
    }
  }
}

const EARLIER = gift('earlier', { amountMinor: 10_000 });

describe('Given the watch for an arriving gift', () => {
  let feed: FakeGiftFeed;
  let donor: WritableSignal<{ id: string } | null>;
  let offline: WritableSignal<boolean>;
  let visibility: DocumentVisibilityState;
  let watch: GiftArrivalWatch;

  function setVisibility(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  async function advance(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    FakeIntersectionObserver.all = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    feed = new FakeGiftFeed();
    feed.gifts.set([EARLIER]);
    donor = signal({ id: 'jana' });
    offline = signal(false);
    TestBed.configureTestingModule({
      providers: [
        GiftArrivalWatch,
        { provide: GIFT_FEED, useValue: feed },
        { provide: AuthStore, useValue: { donor } },
        { provide: Connectivity, useValue: { offline } },
      ],
    });
    watch = TestBed.inject(GiftArrivalWatch);
    watch.enable(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('when nothing shows an intent to pay, then it neither asks the bank nor listens', async () => {
    await advance(GIFT_WATCH_MS);

    expect(feed.asks).toBe(0);
    expect(feed.following).toBe(0);
  });

  it('when the panel is not enabled (no variable symbol), then an intent does nothing', async () => {
    watch.enable(false);

    watch.intent();
    await advance(GIFT_CHECK_OFFSETS_MS[0]);

    expect(feed.asks).toBe(0);
    expect(feed.following).toBe(0);
  });

  it('when no donor is signed in, then an intent does nothing', async () => {
    donor.set(null);

    watch.intent();
    await advance(GIFT_CHECK_OFFSETS_MS[0]);

    expect(feed.asks).toBe(0);
  });

  describe('when the donor shows an intent to pay', () => {
    beforeEach(() => {
      watch.intent();
      TestBed.tick();
    });

    it('then it listens for changes and asks the bank first after 30 s, not before', async () => {
      expect(feed.following).toBe(1);
      await advance(GIFT_CHECK_OFFSETS_MS[0] - 1);
      expect(feed.asks).toBe(0);

      await advance(1);

      expect(feed.asks).toBe(1);
    });

    it('then it asks the bank at 30, 60, 120, 240 and 480 s and no more', async () => {
      const asked: number[] = [];
      let elapsed = 0;
      while (elapsed < GIFT_WATCH_MS) {
        await advance(10_000);
        elapsed += 10_000;
        if (feed.asks > asked.length) {
          asked.push(elapsed);
        }
      }

      expect(asked).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    });

    it('then a check is skipped while the bank is still being asked', async () => {
      feed.asking.set(true);

      await advance(GIFT_CHECK_OFFSETS_MS[0]);

      expect(feed.asks).toBe(0);
    });

    it('then it stops listening 10 minutes after the intent', async () => {
      await advance(GIFT_WATCH_MS);

      expect(feed.following).toBe(0);
    });

    it('then a new gift shows its amount as arrived and ends the watch', async () => {
      feed.gifts.set([EARLIER, gift('new', { amountMinor: 50_000 })]);
      TestBed.tick();

      expect(watch.arrival()).toEqual({ count: 1, totalMinor: 50_000 });
      expect(feed.following).toBe(0);
      await advance(GIFT_WATCH_MS);
      expect(feed.asks).toBe(0);
    });

    it('then several new gifts arrive together with their total', () => {
      feed.gifts.set([
        gift('a', { amountMinor: 50_000 }),
        EARLIER,
        gift('b', { amountMinor: 100_000 }),
      ]);
      TestBed.tick();

      expect(watch.arrival()).toEqual({ count: 2, totalMinor: 150_000 });
    });

    it('then a refund, a 1 Kč account check and an answer about an older symbol do not count', () => {
      feed.gifts.set([
        EARLIER,
        gift('refund', { status: 'REFUNDED' }),
        gift('check', { accountVerification: true, amountMinor: 100 }),
        gift('older', { pairedBy: 'CONFIRMED_SYMBOL' }),
      ]);
      TestBed.tick();

      expect(watch.arrival()).toBeNull();
      expect(feed.following).toBe(1);
    });

    it('then a gift paired by the sender account without the symbol counts', () => {
      feed.gifts.set([EARLIER, gift('by-account', { pairedBy: 'SENDER_ACCOUNT' })]);
      TestBed.tick();

      expect(watch.arrival()).toEqual({ count: 1, totalMinor: 50_000 });
    });

    it('then dismissing the thank-you hides it', () => {
      feed.gifts.set([EARLIER, gift('new')]);
      TestBed.tick();

      watch.dismiss();

      expect(watch.arrival()).toBeNull();
    });

    it('then a repeated intent restarts the schedule', async () => {
      await advance(20_000);
      watch.intent();

      await advance(20_000);
      expect(feed.asks).toBe(0);
      await advance(10_000);

      expect(feed.asks).toBe(1);
    });

    it('then a hidden tab asks nothing and a return asks the bank at once', async () => {
      setVisibility('hidden');
      await advance(GIFT_WATCH_MS * 2);
      expect(feed.asks).toBe(0);
      expect(feed.following).toBe(1);

      setVisibility('visible');
      await advance(0);

      expect(feed.asks).toBe(1);
      await advance(GIFT_CHECK_OFFSETS_MS[0]);
      expect(feed.asks).toBe(2);
    });

    it('then a return within 30 s of the last check waits until 30 s have passed', async () => {
      await advance(GIFT_CHECK_OFFSETS_MS[0]);
      expect(feed.asks).toBe(1);
      setVisibility('hidden');
      await advance(10_000);

      setVisibility('visible');
      await advance(0);
      expect(feed.asks).toBe(1);
      await advance(20_000);

      expect(feed.asks).toBe(2);
    });

    it('then nothing is asked offline and once when the connection returns', async () => {
      offline.set(true);
      TestBed.tick();
      await advance(GIFT_CHECK_OFFSETS_MS[1]);
      expect(feed.asks).toBe(0);

      offline.set(false);
      TestBed.tick();
      await advance(0);

      expect(feed.asks).toBe(1);
    });

    it('then it asks the bank at most 12 times in one watch', async () => {
      for (let round = 0; round < 20; round++) {
        setVisibility('hidden');
        setVisibility('visible');
        await advance(GIFT_CHECK_OFFSETS_MS[0]);
      }

      expect(feed.asks).toBe(GIFT_WATCH_MAX_CHECKS);
    });

    it('then another donor signing in ends the watch', async () => {
      donor.set({ id: 'petr' });
      TestBed.tick();

      expect(feed.following).toBe(0);
      await advance(GIFT_WATCH_MS);
      expect(feed.asks).toBe(0);
    });

    it('then leaving the page that holds the panel ends the watch, as closing it did', async () => {
      watch.pageLeft();

      expect(feed.following).toBe(0);
      await advance(GIFT_WATCH_MS);
      expect(feed.asks).toBe(0);
    });

    it('then disabling the panel ends the watch', async () => {
      watch.enable(false);

      expect(feed.following).toBe(0);
      await advance(GIFT_WATCH_MS);
      expect(feed.asks).toBe(0);
    });
  });

  describe('when the fresh read of the gifts has not come yet', () => {
    beforeEach(() => {
      feed.freshGifts = 'pending';
      watch.intent();
      TestBed.tick();
    });

    it('then nothing counts as arrived until the read names what was there before', () => {
      expect(feed.loads).toBe(1);
      feed.gifts.set([EARLIER, gift('shown-meanwhile')]);
      TestBed.tick();
      expect(watch.arrival()).toBeNull();

      feed.answerRead([EARLIER, gift('shown-meanwhile')]);
      feed.gifts.set([EARLIER, gift('shown-meanwhile'), gift('new')]);
      TestBed.tick();

      expect(watch.arrival()).toEqual({ count: 1, totalMinor: 50_000 });
    });
  });

  it('when the device copy is stale and its sync brings a gift from yesterday, then that gift is no arrival', () => {
    const yesterday = gift('yesterday');
    feed.freshGifts = [EARLIER, yesterday];

    watch.intent();
    feed.gifts.set([EARLIER, yesterday]);
    TestBed.tick();

    expect(watch.arrival()).toBeNull();
  });

  it('when the read of the gifts fails, then the next intent reads them again', () => {
    feed.freshGifts = 'failing';
    watch.intent();
    feed.freshGifts = [EARLIER];

    watch.intent();
    feed.gifts.set([EARLIER, gift('new')]);
    TestBed.tick();

    expect(feed.loads).toBe(2);
    expect(watch.arrival()).toEqual({ count: 1, totalMinor: 50_000 });
  });

  it('when the baseline read failed, then the next check reads it again first and asks the bank only once it is known', async () => {
    feed.freshGifts = 'failing';
    watch.intent();
    feed.freshGifts = 'pending';

    await advance(GIFT_CHECK_OFFSETS_MS[0]);
    expect(feed.loads).toBe(2);
    expect(feed.asks).toBe(0);
    feed.answerRead([EARLIER]);
    await advance(0);

    expect(feed.asks).toBe(1);
  });

  it('when the thanks stand and the donor signs out or another signs in, then the thanks go', () => {
    watch.intent();
    feed.gifts.set([EARLIER, gift('new')]);
    TestBed.tick();
    expect(watch.arrival()).not.toBeNull();

    donor.set(null);
    TestBed.tick();

    expect(watch.arrival()).toBeNull();
  });

  it('when the thanks stand and the panel loses its variable symbol, then the thanks go', () => {
    watch.intent();
    feed.gifts.set([EARLIER, gift('new')]);
    TestBed.tick();

    watch.enable(false);

    expect(watch.arrival()).toBeNull();
  });

  it('when another donor signs in while the gifts change in the same moment, then no gift of the other donor is thanked for', () => {
    watch.intent();
    TestBed.tick();

    donor.set({ id: 'petr' });
    feed.gifts.set([gift('petr-1'), gift('petr-2')]);
    TestBed.tick();

    expect(watch.arrival()).toBeNull();
    expect(feed.following).toBe(0);
  });

  describe('when the panel is observed', () => {
    let panel: HTMLElement;
    let qr: HTMLElement;

    beforeEach(() => {
      panel = document.createElement('div');
      qr = document.createElement('div');
      watch.observe(panel, qr);
    });

    it('then the QR code in view for 5 s counts as an intent', async () => {
      FakeIntersectionObserver.show(qr, true);
      await advance(QR_DWELL_MS - 1);
      expect(feed.following).toBe(0);

      await advance(1);

      expect(feed.following).toBe(1);
    });

    it('then the QR code in view for 5 s while it already watches does not restart the schedule', async () => {
      watch.intent();
      FakeIntersectionObserver.show(qr, true);

      await advance(GIFT_CHECK_OFFSETS_MS[0]);

      expect(feed.asks).toBe(1);
    });

    it('then the QR code leaving the view earlier does not count', async () => {
      FakeIntersectionObserver.show(qr, true);
      await advance(QR_DWELL_MS - 1);
      FakeIntersectionObserver.show(qr, false);

      await advance(QR_DWELL_MS);

      expect(feed.following).toBe(0);
    });

    it('then leaving the tab with the panel in view counts as an intent and the return asks at once', async () => {
      FakeIntersectionObserver.show(panel, true);

      setVisibility('hidden');
      TestBed.tick();
      expect(feed.following).toBe(1);
      expect(feed.asks).toBe(0);
      setVisibility('visible');
      await advance(0);

      expect(feed.asks).toBe(1);
    });

    it('then leaving the tab after the thanks does not start another watch', () => {
      FakeIntersectionObserver.show(panel, true);
      watch.intent();
      feed.gifts.set([EARLIER, gift('new')]);
      TestBed.tick();

      setVisibility('hidden');

      expect(watch.arrival()).not.toBeNull();
      expect(feed.following).toBe(0);
    });

    it('then leaving the tab with the panel scrolled away does not count', async () => {
      FakeIntersectionObserver.show(panel, false);

      setVisibility('hidden');
      setVisibility('visible');
      await advance(GIFT_CHECK_OFFSETS_MS[0]);

      expect(feed.following).toBe(0);
      expect(feed.asks).toBe(0);
    });

    it('then destroying the watch disconnects the observers', () => {
      TestBed.resetTestingModule();

      expect(FakeIntersectionObserver.all.every((observer) => observer.disconnected)).toBe(true);
    });
  });
});
