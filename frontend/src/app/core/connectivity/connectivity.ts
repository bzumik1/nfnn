import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { computed, DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  defer,
  finalize,
  map,
  Observable,
  of,
  share,
  Subject,
  timeout,
  TimeoutError,
} from 'rxjs';
import { ConnectivityProbeApi } from './connectivity-probe-api';

export { PROBE_PATH } from './connectivity-probe-api';

export const OFFLINE_AFTER_MS = 3_000;
export const PROBE_EVERY_MS = 30_000;
export const PROBE_TIMEOUT_MS = 5_000;
export const FRESH_ANSWER_MS = 15_000;
export const SLEEP_TOLERANCE_MS = 1_000;

export type OfflineCause = 'network' | 'server';

export interface ApiOutcome {
  readonly status: number;
  readonly headers: HttpHeaders;
  readonly fromNetwork: boolean;
}

const GATEWAY_STATUSES = new Set([502, 503, 504]);
const EDGE_STATUSES = { from: 520, to: 530 };
const PROBLEM_MEDIA_TYPE = 'application/problem+json';
const SERVICE_WORKER_GAVE_UP = 504;

export function isUnreachable(failure: unknown): boolean {
  return failure instanceof HttpErrorResponse && unreachableStatus(failure.status, failure.headers);
}

function unreachableStatus(status: number, headers: HttpHeaders): boolean {
  if (status === 0) {
    return true;
  }
  const gateway =
    GATEWAY_STATUSES.has(status) || (status >= EDGE_STATUSES.from && status <= EDGE_STATUSES.to);
  return gateway && !(headers.get('Content-Type') ?? '').startsWith(PROBLEM_MEDIA_TYPE);
}

@Injectable({ providedIn: 'root' })
export class Connectivity {
  private readonly probeApi = inject(ConnectivityProbeApi);
  private readonly document = inject(DOCUMENT);
  private readonly offlineFor = signal<OfflineCause | null>(null);
  private failingCause: OfflineCause = 'network';
  private settling: ReturnType<typeof setTimeout> | null = null;
  private probing: ReturnType<typeof setInterval> | null = null;
  private probeInFlight: Observable<boolean> | null = null;
  private serverClockAhead = 0;
  private readonly lost = new Subject<void>();

  readonly offline = computed(() => this.offlineFor() !== null);
  readonly cause = this.offlineFor.asReadonly();
  readonly wentOffline: Observable<void> = this.lost.asObservable();

  constructor() {
    const view = this.document.defaultView;
    const wentOffline = () => this.browserWentOffline();
    const wentOnline = () => this.probeIfOffline();
    const visibilityChanged = () => {
      if (this.visible()) {
        this.probeIfOffline();
      }
    };
    view?.addEventListener('offline', wentOffline);
    view?.addEventListener('online', wentOnline);
    this.document.addEventListener('visibilitychange', visibilityChanged);
    inject(DestroyRef).onDestroy(() => {
      view?.removeEventListener('offline', wentOffline);
      view?.removeEventListener('online', wentOnline);
      this.document.removeEventListener('visibilitychange', visibilityChanged);
      this.stopSettling();
      this.stopProbing();
      this.lost.complete();
    });
    if (view?.navigator.onLine === false) {
      this.startOffline();
      setTimeout(() => this.probe().subscribe());
    }
  }

  browserSaysOffline(): boolean {
    return this.document.defaultView?.navigator.onLine === false;
  }

  serverNow(): number {
    return Date.now() + this.serverClockAhead;
  }

  answered(outcome: ApiOutcome): void {
    if (unreachableStatus(outcome.status, outcome.headers)) {
      this.failed(this.causeOf(outcome));
      return;
    }
    const date = Date.parse(outcome.headers.get('Date') ?? '');
    if (outcome.fromNetwork) {
      if (Number.isFinite(date)) {
        this.serverClockAhead = date - Date.now();
      }
      this.reached();
      return;
    }
    if (outcome.status >= 300) {
      this.reached();
    } else if (Number.isFinite(date)) {
      if (this.serverNow() - date > FRESH_ANSWER_MS) {
        this.doubt();
      } else if (this.offlineFor() === null) {
        this.reached();
      } else {
        this.probe().subscribe();
      }
    }
  }

  tryAgain(): Observable<boolean> {
    return defer(() => this.probe());
  }

  private causeOf(outcome: ApiOutcome): OfflineCause {
    const workerGaveUp = !outcome.fromNetwork && outcome.status === SERVICE_WORKER_GAVE_UP;
    const browserOffline = this.document.defaultView?.navigator.onLine === false;
    return outcome.status === 0 || workerGaveUp || browserOffline ? 'network' : 'server';
  }

  private failed(cause: OfflineCause): void {
    this.failingCause = cause;
    if (this.offlineFor() !== null) {
      this.offlineFor.set(cause);
      return;
    }
    if (this.settling === null) {
      const since = Date.now();
      this.settling = setTimeout(() => this.settleUnlessWoken(since), OFFLINE_AFTER_MS);
      if (this.probeInFlight === null) {
        this.probe().subscribe();
      }
    }
  }

  private reached(): void {
    this.stopSettling();
    if (this.offlineFor() !== null) {
      this.offlineFor.set(null);
      this.stopProbing();
    }
  }

  private browserWentOffline(): void {
    this.startOffline();
    this.probe().subscribe();
  }

  private startOffline(): void {
    this.failingCause = 'network';
    this.stopSettling();
    if (this.offlineFor() === null) {
      this.settled();
    }
  }

  private doubt(): void {
    if (this.offlineFor() === null && this.settling === null) {
      this.probe().subscribe();
    }
  }

  private settleUnlessWoken(since: number): void {
    if (!sleptThrough(since, OFFLINE_AFTER_MS)) {
      this.settled();
      return;
    }
    this.settling = null;
    this.failed(this.failingCause);
  }

  private settled(): void {
    this.settling = null;
    const wasOnline = this.offlineFor() === null;
    this.offlineFor.set(this.failingCause);
    if (wasOnline) {
      this.lost.next();
    }
    this.stopProbing();
    this.probing = setInterval(() => {
      if (this.visible()) {
        this.probe().subscribe();
      }
    }, PROBE_EVERY_MS);
  }

  private gaveUpWaiting(): void {
    this.startOffline();
    this.offlineFor.set('network');
  }

  private probeIfOffline(): void {
    if (this.offlineFor() !== null) {
      this.probe().subscribe();
    }
  }

  private probe(): Observable<boolean> {
    if (this.probeInFlight === null) {
      this.probeInFlight = this.askServer(true).pipe(
        finalize(() => (this.probeInFlight = null)),
        share(),
      );
    }
    return this.probeInFlight;
  }

  private askServer(mayAskAgainAfterSleep: boolean): Observable<boolean> {
    const since = Date.now();
    return this.probeApi.probe().pipe(
      timeout(PROBE_TIMEOUT_MS),
      map(() => true),
      catchError((failure: unknown) => {
        if (!(failure instanceof TimeoutError)) {
          return of(!isUnreachable(failure));
        }
        if (mayAskAgainAfterSleep && sleptThrough(since, PROBE_TIMEOUT_MS)) {
          return this.askServer(false);
        }
        this.gaveUpWaiting();
        return of(false);
      }),
    );
  }

  private visible(): boolean {
    return this.document.visibilityState !== 'hidden';
  }

  private stopSettling(): void {
    if (this.settling !== null) {
      clearTimeout(this.settling);
      this.settling = null;
    }
  }

  private stopProbing(): void {
    if (this.probing !== null) {
      clearInterval(this.probing);
      this.probing = null;
    }
  }
}

function sleptThrough(since: number, waited: number): boolean {
  return Date.now() - since > waited + SLEEP_TOLERANCE_MS;
}
