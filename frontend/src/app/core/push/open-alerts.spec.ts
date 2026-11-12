import type { Mock } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { AuthStore } from '../auth/auth-store';

import { AppBadge } from './app-badge';
import { OPEN_ALERTS_REFRESH_GAP_MS, OpenAlerts } from './open-alerts';
import { NO_PUSH, SERVICE_WORKER_PUSH } from './service-worker-push';

const PUSH_URL = '/api/admin/operations/push';
const MAIL = { area: 'mail', since: '2026-11-12T05:15:00Z' } as const;

function answer(openAlerts: readonly object[]) {
  return { publicKey: `B${'A'.repeat(86)}`, deviceSession: true, subscriptions: [], openAlerts };
}

describe('Given the app open on any page', () => {
  let http: HttpTestingController;
  let badge: { show: Mock<(count: number) => void> };
  let isAdmin: WritableSignal<boolean>;
  let messages: Subject<unknown>;
  let visibility: DocumentVisibilityState;
  let alerts: OpenAlerts;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    badge = { show: vi.fn() };
    isAdmin = signal(false);
    messages = new Subject<unknown>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppBadge, useValue: badge },
        { provide: AuthStore, useValue: { isAdmin } },
        { provide: SERVICE_WORKER_PUSH, useValue: { ...NO_PUSH, messages } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    alerts = TestBed.inject(OpenAlerts);
    alerts.start();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  function becomes(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function signsInAsAdministrator(): void {
    isAdmin.set(true);
    TestBed.tick();
  }

  function signsOut(): void {
    isAdmin.set(false);
    TestBed.tick();
  }

  it('when nobody with the administrator role is signed in, then the server is not asked and nothing is known', () => {
    TestBed.tick();
    becomes('hidden');
    vi.advanceTimersByTime(OPEN_ALERTS_REFRESH_GAP_MS);
    becomes('visible');

    http.expectNone(PUSH_URL);
    expect(alerts.alerts()).toBeNull();
    expect(badge.show).not.toHaveBeenCalled();
  });

  it('when an administrator opens the app on a public page, then the badge and the open alerts follow the server', () => {
    signsInAsAdministrator();

    http.expectOne({ method: 'GET', url: PUSH_URL }).flush(answer([MAIL]));

    expect(badge.show).toHaveBeenCalledWith(1);
    expect(alerts.alerts()).toEqual([MAIL]);
  });

  it('when the app comes back after a minute and the fault was resolved meanwhile, then the badge is cleared', () => {
    signsInAsAdministrator();
    http.expectOne(PUSH_URL).flush(answer([MAIL]));
    becomes('hidden');
    vi.advanceTimersByTime(OPEN_ALERTS_REFRESH_GAP_MS);

    becomes('visible');
    becomes('visible');

    http.expectOne(PUSH_URL).flush(answer([]));
    expect(badge.show).toHaveBeenLastCalledWith(0);
    expect(alerts.alerts()).toEqual([]);
  });

  it('when the app comes back within a minute, then the server is not asked again', () => {
    signsInAsAdministrator();
    http.expectOne(PUSH_URL).flush(answer([]));
    becomes('hidden');
    vi.advanceTimersByTime(OPEN_ALERTS_REFRESH_GAP_MS - 1);

    becomes('visible');

    http.expectNone(PUSH_URL);
  });

  it('when an alert arrives while the app is open, then the open alerts are read again at once', () => {
    signsInAsAdministrator();
    http.expectOne(PUSH_URL).flush(answer([]));

    messages.next({ v: 1, kind: 'mail-outage', count: 1 });

    http.expectOne(PUSH_URL).flush(answer([MAIL]));
    expect(alerts.alerts()).toEqual([MAIL]);
  });

  it('when the open alerts cannot be read, then the badge is left as it is', () => {
    signsInAsAdministrator();

    http.expectOne(PUSH_URL).flush(null, { status: 500, statusText: 'Error' });

    expect(badge.show).not.toHaveBeenCalled();
    expect(alerts.alerts()).toBeNull();
  });

  it('when the administrator signs out before the answer comes, then the read is cancelled and nothing more is asked', () => {
    signsInAsAdministrator();
    const pending = http.expectOne(PUSH_URL);

    signsOut();
    expect(pending.cancelled).toBe(true);
    becomes('hidden');
    vi.advanceTimersByTime(OPEN_ALERTS_REFRESH_GAP_MS);
    becomes('visible');

    expect(badge.show).not.toHaveBeenCalled();
    expect(alerts.alerts()).toBeNull();
    http.expectNone(PUSH_URL);
  });

  it('when a page of the administration asks for a fresh look within a minute, then the open alerts are read again at once', () => {
    signsInAsAdministrator();
    http.expectOne(PUSH_URL).flush(answer([MAIL]));

    alerts.refresh();

    http.expectOne(PUSH_URL).flush(answer([]));
    expect(alerts.alerts()).toEqual([]);
    expect(badge.show).toHaveBeenLastCalledWith(0);
  });

  it('when the alerts page has read the settings itself, then its answer sets the badge and the open alerts without another read', () => {
    signsInAsAdministrator();
    http.expectOne(PUSH_URL).flush(answer([]));

    alerts.accept([MAIL]);

    expect(alerts.alerts()).toEqual([MAIL]);
    expect(badge.show).toHaveBeenLastCalledWith(1);
    http.expectNone(PUSH_URL);
  });

  it('when two alerts arrive while a read is running, then one more read follows when it ends, and only the last answer stays', () => {
    signsInAsAdministrator();
    const first = http.expectOne(PUSH_URL);

    messages.next({ v: 1, kind: 'mail-outage', count: 1 });
    messages.next({ v: 1, kind: 'backups-outage', count: 2 });
    http.expectNone(PUSH_URL);
    first.flush(answer([]));

    http.expectOne(PUSH_URL).flush(answer([MAIL]));
    http.expectNone(PUSH_URL);
    expect(alerts.alerts()).toEqual([MAIL]);
    expect(badge.show).toHaveBeenLastCalledWith(1);
  });

  it('when the administrator signs out and in again before the first answer comes, then only the answer of the new session counts', () => {
    signsInAsAdministrator();
    const old = http.expectOne(PUSH_URL);
    signsOut();
    signsInAsAdministrator();
    const fresh = http.expectOne(PUSH_URL);

    expect(old.cancelled).toBe(true);
    fresh.flush(answer([]));

    expect(alerts.alerts()).toEqual([]);
    expect(badge.show).toHaveBeenCalledTimes(1);
    expect(badge.show).toHaveBeenCalledWith(0);
  });

  it('when someone who is not an administrator is signed in, then an answer handed over by a page is ignored', () => {
    alerts.accept([MAIL]);

    expect(alerts.alerts()).toBeNull();
    expect(badge.show).not.toHaveBeenCalled();
  });
});
