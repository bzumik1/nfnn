import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse, HttpEvent, HttpEventType } from '@angular/common/http';
import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { filter, Observable, Subject, Subscription } from 'rxjs';
import { AuthStore } from '../auth/auth-store';
import { EventStreamReader, StreamEvent } from './event-stream';
import { LiveApi } from './live-api';

export type LiveFeed = 'donations' | 'bank-accounts' | 'bank-import' | 'payments';

const FEEDS: readonly LiveFeed[] = ['donations', 'bank-accounts', 'bank-import', 'payments'];
const REVISION_EVENT = 'revision';
const CHANGED_EVENT = 'changed';
const REFUSED = new Set([401, 403]);

export const LIVE_HIDDEN_GRACE_MS = 30_000;
export const LIVE_RETRY_FIRST_MS = 1_000;
export const LIVE_RETRY_MAX_MS = 60_000;
export const LIVE_SHORT_STREAM_MS = 10_000;
export const LIVE_RECONNECT_SPREAD_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class LiveUpdates {
  private readonly api = inject(LiveApi);
  private readonly auth = inject(AuthStore);
  private readonly document = inject(DOCUMENT);
  private readonly listeners = signal(0);
  private readonly visible = signal(true);
  private readonly streaming = signal(false);
  private readonly hints = new Subject<LiveFeed | Resync>();
  private stream: Subscription | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private hiding: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private joined = 0;
  private missedSince: number | null = null;
  private refusedFor: unknown = null;

  readonly connected = this.streaming.asReadonly();

  constructor() {
    this.visible.set(this.document.visibilityState !== 'hidden');
    this.document.addEventListener('visibilitychange', () => this.visibilityChanged());
    effect(() => {
      const donor = this.auth.donor();
      const wanted = donor !== null && this.listeners() > 0 && this.visible();
      untracked(() => this.reconcile(wanted, donor));
    });
  }

  changes(feeds: readonly LiveFeed[]): Observable<void> {
    return new Observable<void>((subscriber) => {
      const joinedAt = ++this.joined;
      this.listeners.update((count) => count + 1);
      const hints = this.hints
        .pipe(
          filter((hint) =>
            typeof hint === 'object' ? joinedAt <= hint.listenersSince : feeds.includes(hint),
          ),
        )
        .subscribe(() => subscriber.next());
      return () => {
        hints.unsubscribe();
        this.listeners.update((count) => count - 1);
      };
    });
  }

  private wanted(): boolean {
    return this.auth.donor() !== null && this.listeners() > 0 && this.visible();
  }

  private reconcile(wanted: boolean, donor: unknown): void {
    if (!wanted) {
      this.disconnect();
      return;
    }
    if (this.refusedFor !== null && this.refusedFor !== donor) {
      this.refusedFor = null;
    }
    if (this.stream === null && this.retry === null && this.refusedFor === null) {
      this.connect();
    }
  }

  private visibilityChanged(): void {
    if (this.document.visibilityState === 'hidden') {
      this.hiding ??= setTimeout(() => {
        this.hiding = null;
        this.visible.set(false);
      }, LIVE_HIDDEN_GRACE_MS);
      return;
    }
    if (this.hiding !== null) {
      clearTimeout(this.hiding);
      this.hiding = null;
    }
    this.visible.set(true);
  }

  private connect(): void {
    const startedAt = Date.now();
    let reader = new EventStreamReader();
    let ended = false;
    const end = (failure: unknown) => {
      if (!ended) {
        ended = true;
        this.ended(failure, startedAt);
      }
    };
    this.stream = this.api.stream().subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Sent) {
          reader = new EventStreamReader();
        } else {
          this.read(reader, event);
        }
      },
      error: (failure: unknown) => end(failure),
      complete: () => end(null),
    });
  }

  private read(reader: EventStreamReader, event: HttpEvent<string>): void {
    if (event.type === HttpEventType.DownloadProgress) {
      reader.read(event.partialText ?? '').forEach((each) => this.handle(each));
    } else if (event.type === HttpEventType.Response) {
      reader.read(event.body ?? '').forEach((each) => this.handle(each));
    }
  }

  private handle(event: StreamEvent): void {
    if (event.event === REVISION_EVENT) {
      this.streaming.set(true);
      if (this.missedSince !== null) {
        this.hints.next({ listenersSince: this.missedSince });
        this.missedSince = null;
      }
      return;
    }
    if (event.event === CHANGED_EVENT) {
      const feed = feedOf(event.data);
      if (feed !== null) {
        this.hints.next(feed);
      }
    }
  }

  private ended(failure: unknown, startedAt: number): void {
    const streamed = this.streaming();
    this.stream = null;
    this.lost(streamed);
    if (failure instanceof HttpErrorResponse && REFUSED.has(failure.status)) {
      this.refusedFor = this.auth.donor();
      return;
    }
    const lasted = streamed && Date.now() - startedAt >= LIVE_SHORT_STREAM_MS;
    if (lasted) {
      this.failures = 0;
    }
    if (failure === null && lasted) {
      this.scheduleReconnect(Math.random() * LIVE_RECONNECT_SPREAD_MS);
      return;
    }
    this.failures++;
    const delay = Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_FIRST_MS * 2 ** (this.failures - 1));
    this.scheduleReconnect(delay / 2 + (Math.random() * delay) / 2);
  }

  private scheduleReconnect(delay: number): void {
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.wanted() && this.stream === null) {
        this.connect();
      }
    }, delay);
  }

  private disconnect(): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    const stream = this.stream;
    this.stream = null;
    stream?.unsubscribe();
    this.lost(this.streaming());
  }

  private lost(streamed: boolean): void {
    if (streamed) {
      this.missedSince ??= this.joined;
    }
    this.streaming.set(false);
  }
}

interface Resync {
  readonly listenersSince: number;
}

function feedOf(data: string): LiveFeed | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const feed =
      parsed !== null && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)['feed']
        : null;
    return FEEDS.find((each) => each === feed) ?? null;
  } catch {
    return null;
  }
}
