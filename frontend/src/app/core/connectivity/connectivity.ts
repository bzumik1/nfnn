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
  timeout,
  TimeoutError,
} from 'rxjs';
import { ConnectivityProbeApi } from './connectivity-probe-api';

export { PROBE_PATH } from './connectivity-probe-api';

export const OFFLINE_AFTER_MS = 3_000;
export const PROBE_EVERY_MS = 30_000;
export const PROBE_TIMEOUT_MS = 10_000;
export const FRESH_ANSWER_MS = 15_000;

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

  readonly offline = computed(() => this.offlineFor() !== null);
  readonly cause = this.offlineFor.asReadonly();

  constructor() {
    const view = this.document.defaultView;
    const wentOffline = () => this.doubt();
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
    });
    if (view?.navigator.onLine === false) {
      setTimeout(() => this.doubt());
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
      if (this.serverNow() - date <= FRESH_ANSWER_MS) {
        this.reached();
      } else {
        this.doubt();
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
      this.settling = setTimeout(() => this.settled(), OFFLINE_AFTER_MS);
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

  private doubt(): void {
    if (this.offlineFor() === null && this.settling === null) {
      this.probe().subscribe();
    }
  }

  private settled(): void {
    this.settling = null;
    this.offlineFor.set(this.failingCause);
    this.stopProbing();
    this.probing = setInterval(() => {
      if (this.visible()) {
        this.probe().subscribe();
      }
    }, PROBE_EVERY_MS);
  }

  private probeIfOffline(): void {
    if (this.offlineFor() !== null) {
      this.probe().subscribe();
    }
  }

  private probe(): Observable<boolean> {
    if (this.probeInFlight === null) {
      this.probeInFlight = this.probeApi.probe().pipe(
        timeout(PROBE_TIMEOUT_MS),
        map(() => true),
        catchError((failure: unknown) => {
          if (failure instanceof TimeoutError) {
            this.failed('network');
            return of(false);
          }
          return of(!isUnreachable(failure));
        }),
        finalize(() => (this.probeInFlight = null)),
        share(),
      );
    }
    return this.probeInFlight;
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
