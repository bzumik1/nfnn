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
    TestBed.resetTestingModule();
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
    http.verify();
  });

  function becomes(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  async function signsInAsAdministrator(): Promise<void> {
    isAdmin.set(true);
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

  it('when an administrator opens the app on a public page, then the badge and the open alerts follow the server', async () => {
    await signsInAsAdministrator();

    http.expectOne({ method: 'GET', url: PUSH_URL }).flush(answer([MAIL]));

    expect(badge.show).toHaveBeenCalledWith(1);
    expect(alerts.alerts()).toEqual([MAIL]);
  });

  it('when the app comes back after a minute and the fault was resolved meanwhile, then the badge is cleared', async () => {
    await signsInAsAdministrator();
    http.expectOne(PUSH_URL).flush(answer([MAIL]));
    becomes('hidden');
    vi.advanceTimersByTime(OPEN_ALERTS_REFRESH_GAP_MS);

    becomes('visible');
    becomes('visible');

    http.expectOne(PUSH_URL).flush(answer([]));
    expect(badge.show).toHaveBeenLastCalledWith(0);
    expect(alerts.alerts()).toEqual([]);
  });

  it('when the app comes back within a minute, then the server is not asked again', async () => {
    await signsInAsAdministrator();
    http.expectOne(PUSH_URL).flush(answer([]));
    becomes('hidden');
    vi.advanceTimersByTime(OPEN_ALERTS_REFRESH_GAP_MS - 1);

    becomes('visible');

    http.expectNone(PUSH_URL);
  });

  it('when an alert arrives while the app is open, then the open alerts are read again at once', async () => {
    await signsInAsAdministrator();
    http.expectOne(PUSH_URL).flush(answer([]));

    messages.next({ v: 1, kind: 'mail-outage', count: 1 });

    http.expectOne(PUSH_URL).flush(answer([MAIL]));
    expect(alerts.alerts()).toEqual([MAIL]);
  });

  it('when the open alerts cannot be read, then the badge is left as it is', async () => {
    await signsInAsAdministrator();

    http.expectOne(PUSH_URL).flush(null, { status: 500, statusText: 'Error' });

    expect(badge.show).not.toHaveBeenCalled();
    expect(alerts.alerts()).toBeNull();
  });

  it('when the administrator signs out before the answer comes, then the answer is dropped and nothing more is asked', async () => {
    await signsInAsAdministrator();
    const pending = http.expectOne(PUSH_URL);

    isAdmin.set(false);
    TestBed.tick();
    pending.flush(answer([MAIL]));
    becomes('hidden');
    vi.advanceTimersByTime(OPEN_ALERTS_REFRESH_GAP_MS);
    becomes('visible');

    expect(badge.show).not.toHaveBeenCalled();
    expect(alerts.alerts()).toBeNull();
    http.expectNone(PUSH_URL);
  });
});
