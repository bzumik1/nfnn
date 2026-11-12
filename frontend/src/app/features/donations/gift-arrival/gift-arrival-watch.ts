import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  effect,
  EffectRef,
  inject,
  Injectable,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { Subscription, take } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { DonationItem } from '../donations-api';
import { GIFT_FEED, GiftFeed } from './gift-feed';
import { RepositoryGiftFeed } from './repository-gift-feed';

export const GIFT_CHECK_OFFSETS_MS: readonly number[] = [30_000, 60_000, 120_000, 240_000, 480_000];
export const GIFT_WATCH_MS = 600_000;
export const GIFT_WATCH_MAX_CHECKS = 12;
export const GIFT_CHECK_SPACING_MS = 30_000;
export const QR_DWELL_MS = 5_000;
const QR_IN_VIEW_RATIO = 0.5;

export interface GiftArrival {
  readonly count: number;
  readonly totalMinor: number;
}

interface Watching {
  readonly donorId: string;
  readonly feed: GiftFeed;
  baseline: ReadonlySet<string> | null;
  baselineRead: Subscription | null;
  askAfterBaseline: boolean;
  checks: number;
  following: Subscription | null;
  effects: readonly EffectRef[];
}

@Injectable()
export class GiftArrivalWatch {
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthStore);
  private readonly connectivity = inject(Connectivity);
  private readonly document = inject(DOCUMENT);
  private readonly provided = inject(GIFT_FEED, { optional: true });
  private readonly shown = signal<GiftArrival | null>(null);
  private enabled = false;
  private thankedDonor: string | null = null;
  private watching: Watching | null = null;
  private scheduled: ReturnType<typeof setTimeout>[] = [];
  private lastAskedAt: number | null = null;
  private dwell: ReturnType<typeof setTimeout> | undefined;
  private panelInView = false;
  private readonly observers: IntersectionObserver[] = [];

  readonly arrival = this.shown.asReadonly();
  readonly listedHere = this.provided?.listedHere ?? false;

  constructor() {
    const visibilityChanged = () => this.visibilityChanged();
    this.document.addEventListener('visibilitychange', visibilityChanged);
    effect(() => {
      const donorId = this.auth.donor()?.id ?? null;
      untracked(() => {
        if (this.thankedDonor !== null && donorId !== this.thankedDonor) {
          this.dismiss();
        }
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', visibilityChanged);
      this.observers.forEach((observer) => observer.disconnect());
      clearTimeout(this.dwell);
      this.end();
    });
  }

  enable(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.end();
      this.dismiss();
    }
  }

  intent(): void {
    const armedBefore = this.watching;
    const watching = this.arm();
    if (watching === null) {
      return;
    }
    const baselineMissing = watching.baseline === null && (watching.baselineRead?.closed ?? true);
    if (watching === armedBefore && baselineMissing) {
      this.readBaseline(watching);
    }
    this.kick(false);
  }

  dismiss(): void {
    this.shown.set(null);
    this.thankedDonor = null;
  }

  observe(panel: Element, qr: Element): void {
    if (typeof IntersectionObserver !== 'function') {
      return;
    }
    const panelObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        this.panelInView = entry.isIntersecting;
      }
    });
    const qrObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.qrSeen(entry.isIntersecting && entry.intersectionRatio >= QR_IN_VIEW_RATIO);
        }
      },
      { threshold: QR_IN_VIEW_RATIO },
    );
    panelObserver.observe(panel);
    qrObserver.observe(qr);
    this.observers.push(panelObserver, qrObserver);
  }

  private qrSeen(inView: boolean): void {
    clearTimeout(this.dwell);
    if (inView && this.visible()) {
      this.dwell = setTimeout(() => this.startWatching(), QR_DWELL_MS);
    }
  }

  private startWatching(): void {
    if (this.watching === null) {
      this.intent();
    }
  }

  private visibilityChanged(): void {
    if (!this.visible()) {
      clearTimeout(this.dwell);
      this.clearSchedule();
      if (this.panelInView && this.shown() === null) {
        this.arm();
      }
      return;
    }
    if (this.watching !== null) {
      this.kick(true);
    }
  }

  private arm(): Watching | null {
    if (this.watching !== null) {
      return this.watching;
    }
    const donor = untracked(this.auth.donor);
    if (!this.enabled || donor === null) {
      return null;
    }
    const feed = this.provided ?? this.injector.get(RepositoryGiftFeed);
    const watching: Watching = {
      donorId: donor.id,
      feed,
      baseline: null,
      baselineRead: null,
      askAfterBaseline: false,
      checks: 0,
      following: null,
      effects: [],
    };
    this.watching = watching;
    this.readBaseline(watching);
    watching.following = feed.follow().subscribe({ error: () => undefined });
    watching.effects = [
      effect(() => this.giftsChanged(watching, feed.gifts()), { injector: this.injector }),
      this.followConditions(watching),
    ];
    return watching;
  }

  private readBaseline(watching: Watching): void {
    watching.baselineRead = watching.feed
      .requestGifts()
      .pipe(take(1))
      .subscribe({
        next: (gifts) => {
          if (this.watching !== watching) {
            return;
          }
          watching.baseline = idsOf(gifts);
          if (watching.askAfterBaseline) {
            watching.askAfterBaseline = false;
            this.askSoon();
          }
        },
        error: () => undefined,
      });
  }

  private followConditions(watching: Watching): EffectRef {
    let wasOffline = untracked(this.connectivity.offline);
    return effect(
      () => {
        const donorId = this.auth.donor()?.id ?? null;
        const offline = this.connectivity.offline();
        untracked(() => {
          if (donorId !== watching.donorId) {
            this.end();
            return;
          }
          if (wasOffline && !offline) {
            this.askSoon();
          }
          wasOffline = offline;
        });
      },
      { injector: this.injector },
    );
  }

  private giftsChanged(watching: Watching, gifts: readonly DonationItem[] | null): void {
    untracked(() => {
      const baseline = watching.baseline;
      if (
        this.watching !== watching ||
        gifts === null ||
        baseline === null ||
        this.auth.donor()?.id !== watching.donorId
      ) {
        return;
      }
      const arrived = gifts.filter((gift) => !baseline.has(gift.id) && countsAsGift(gift));
      if (arrived.length === 0) {
        return;
      }
      this.thankedDonor = watching.donorId;
      this.shown.set({
        count: arrived.length,
        totalMinor: arrived.reduce((total, gift) => total + gift.amountMinor, 0),
      });
      this.end();
    });
  }

  private kick(returned: boolean): void {
    this.clearSchedule();
    if (!this.visible()) {
      return;
    }
    this.later(() => this.end(), GIFT_WATCH_MS);
    if (returned) {
      this.askSoon();
    }
    for (const offset of GIFT_CHECK_OFFSETS_MS) {
      this.later(() => this.askSoon(), offset);
    }
  }

  private askSoon(): void {
    const watching = this.watching;
    if (
      watching === null ||
      !this.visible() ||
      this.connectivity.offline() ||
      watching.checks >= GIFT_WATCH_MAX_CHECKS
    ) {
      return;
    }
    if (watching.baseline === null) {
      watching.askAfterBaseline = true;
      if (watching.baselineRead?.closed ?? true) {
        this.readBaseline(watching);
      }
      return;
    }
    const wait =
      this.lastAskedAt === null ? 0 : this.lastAskedAt + GIFT_CHECK_SPACING_MS - Date.now();
    if (wait > 0) {
      this.later(() => this.askSoon(), wait);
      return;
    }
    if (watching.feed.asking()) {
      return;
    }
    watching.checks++;
    this.lastAskedAt = Date.now();
    watching.feed.askBank();
  }

  private later(work: () => void, delayMs: number): void {
    this.scheduled.push(setTimeout(work, delayMs));
  }

  private clearSchedule(): void {
    this.scheduled.forEach((timer) => clearTimeout(timer));
    this.scheduled = [];
  }

  private end(): void {
    const watching = this.watching;
    this.clearSchedule();
    if (watching === null) {
      return;
    }
    this.watching = null;
    watching.baselineRead?.unsubscribe();
    watching.following?.unsubscribe();
    watching.effects.forEach((ref) => ref.destroy());
  }

  private visible(): boolean {
    return this.document.visibilityState !== 'hidden';
  }
}

function idsOf(gifts: readonly DonationItem[]): ReadonlySet<string> {
  return new Set(gifts.map((gift) => gift.id));
}

function countsAsGift(gift: DonationItem): boolean {
  return (
    gift.status === 'RECEIVED' && !gift.accountVerification && gift.pairedBy !== 'CONFIRMED_SYMBOL'
  );
}
