import type { Mock } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppBadge } from '../../../core/push/app-badge';
import { adminPush } from '../testing/admin-fixtures';
import { ALERT_BADGE_REFRESH_GAP_MS, AlertBadgeRefresh } from './alert-badge-refresh';

const PUSH_URL = '/api/admin/operations/push';

describe('Given the administration open in a tab', () => {
  let http: HttpTestingController;
  let badge: { show: Mock<(count: number) => void> };
  let visibility: DocumentVisibilityState;
  let ended: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    badge = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppBadge, useValue: badge },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const destroy: (() => void)[] = [];
    ended = () => destroy.forEach((callback) => callback());
    TestBed.inject(AlertBadgeRefresh).watch({
      onDestroy: (callback: () => void) => destroy.push(callback),
    } as unknown as DestroyRef);
  });

  afterEach(() => {
    ended();
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
    http.verify();
  });

  function becomes(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('when the administration starts, then the badge shows the open alerts the server names', () => {
    http
      .expectOne({ method: 'GET', url: PUSH_URL })
      .flush(adminPush({ openAlerts: [{ area: 'mail', since: '2026-11-04T05:15:00Z' }] }));

    expect(badge.show).toHaveBeenCalledWith(1);
  });

  it('when the administration closes before the answer comes, then the badge is left as it is', () => {
    const answer = http.expectOne(PUSH_URL);
    ended();

    answer.flush(adminPush({ openAlerts: [{ area: 'mail', since: '2026-11-04T05:15:00Z' }] }));

    expect(badge.show).not.toHaveBeenCalled();
  });

  it('when the settings cannot be read, then the badge is left as it is and nothing is shown', () => {
    http.expectOne(PUSH_URL).flush(null, { status: 500, statusText: 'Error' });

    expect(badge.show).not.toHaveBeenCalled();
  });

  it('when the tab comes back within a minute, then the server is not asked again', () => {
    http.expectOne(PUSH_URL).flush(adminPush());
    becomes('hidden');
    vi.advanceTimersByTime(ALERT_BADGE_REFRESH_GAP_MS - 1);

    becomes('visible');

    http.expectNone(PUSH_URL);
  });

  it('when the tab comes back after a minute, then the badge is read again once', () => {
    http.expectOne(PUSH_URL).flush(adminPush());
    becomes('hidden');
    vi.advanceTimersByTime(ALERT_BADGE_REFRESH_GAP_MS);

    becomes('visible');
    becomes('visible');

    http.expectOne(PUSH_URL).flush(adminPush());
    expect(badge.show).toHaveBeenLastCalledWith(0);
  });

  it('when the administration is left, then a tab coming back asks nothing', () => {
    http.expectOne(PUSH_URL).flush(adminPush());
    ended();
    vi.advanceTimersByTime(ALERT_BADGE_REFRESH_GAP_MS);

    becomes('visible');

    http.expectNone(PUSH_URL);
  });
});
