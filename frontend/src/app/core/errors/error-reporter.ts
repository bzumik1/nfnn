import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';

import { Connectivity } from '../navigation/connectivity';
import { APP_REVISION } from './app-revision';
import { ClientPlatform, detectPlatform } from './client-platform';
import { ErrorKind, ErrorName, errorNameOf, ErrorPlace } from './error-vocabulary';

export const CLIENT_ERRORS_PATH = '/api/operations/client-errors';
export const REPEAT_WINDOW_MS = 10 * 60 * 1000;
export const MAX_REPORTS_PER_PAGE_LOAD = 10;
export const MAX_QUEUED_REPORTS = 20;
export const MAX_COUNT = 100;

interface ClientErrorReport {
  readonly kind: ErrorKind;
  readonly place: ErrorPlace;
  readonly name: ErrorName;
  readonly appVersion: string;
  readonly browser: ClientPlatform['browser'];
  readonly browserMajor?: number;
  readonly os: ClientPlatform['os'];
  readonly display: ClientPlatform['display'];
  readonly count: number;
}

@Injectable({ providedIn: 'root' })
export class ErrorReporter {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly connectivity = inject(Connectivity);
  private readonly lastSent = new Map<string, number>();
  private readonly heldBack = new Map<string, number>();
  private readonly queue: ClientErrorReport[] = [];
  private platform: ClientPlatform | null = null;
  private sent = 0;

  constructor() {
    const flush = () => this.flush();
    this.window?.addEventListener('online', flush);
    inject(DestroyRef).onDestroy(() => this.window?.removeEventListener('online', flush));
  }

  report(kind: ErrorKind, place: ErrorPlace, error?: unknown): void {
    try {
      this.collect(kind, place, errorNameOf(error));
    } catch {
      return;
    }
  }

  private collect(kind: ErrorKind, place: ErrorPlace, name: ErrorName): void {
    const key = `${kind} ${place} ${name}`;
    const now = Date.now();
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < REPEAT_WINDOW_MS) {
      this.heldBack.set(key, Math.min(MAX_COUNT - 1, (this.heldBack.get(key) ?? 0) + 1));
      return;
    }
    const count = 1 + (this.heldBack.get(key) ?? 0);
    this.heldBack.delete(key);
    this.lastSent.set(key, now);
    const report = this.reportOf(kind, place, name, count);
    if (this.connectivity.isOffline()) {
      if (this.queue.length < MAX_QUEUED_REPORTS) {
        this.queue.push(report);
      }
      return;
    }
    this.send(report);
  }

  private flush(): void {
    try {
      while (this.queue.length > 0 && !this.connectivity.isOffline()) {
        this.send(this.queue.shift()!);
      }
    } catch {
      return;
    }
  }

  private reportOf(
    kind: ErrorKind,
    place: ErrorPlace,
    name: ErrorName,
    count: number,
  ): ClientErrorReport {
    const { browser, browserMajor, os, display } = this.currentPlatform();
    return {
      kind,
      place,
      name,
      appVersion: APP_REVISION,
      browser,
      ...(browserMajor === null ? {} : { browserMajor }),
      os,
      display,
      count,
    };
  }

  private currentPlatform(): ClientPlatform {
    if (this.platform === null) {
      const navigator = this.window?.navigator;
      this.platform = detectPlatform(
        { userAgent: navigator?.userAgent ?? '', maxTouchPoints: navigator?.maxTouchPoints ?? 0 },
        this.runsStandalone(),
      );
    }
    return this.platform;
  }

  private runsStandalone(): boolean {
    const view = this.window;
    if (view === null) {
      return false;
    }
    const installed = (view.navigator as Navigator & { readonly standalone?: boolean }).standalone;
    return (
      installed === true ||
      (typeof view.matchMedia === 'function' &&
        view.matchMedia('(display-mode: standalone)').matches)
    );
  }

  private send(report: ClientErrorReport): void {
    if (this.sent >= MAX_REPORTS_PER_PAGE_LOAD) {
      return;
    }
    this.sent++;
    fetch(CLIENT_ERRORS_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  }
}
