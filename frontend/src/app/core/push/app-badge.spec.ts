import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { AuthStore } from '../auth/auth-store';

import { AppBadge } from './app-badge';
import { NO_PUSH, SERVICE_WORKER_PUSH } from './service-worker-push';

describe('Given the badge of the app icon', () => {
  let messages: Subject<unknown>;
  let isAdmin: WritableSignal<boolean>;

  beforeEach(() => {
    messages = new Subject<unknown>();
    isAdmin = signal(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: SERVICE_WORKER_PUSH, useValue: { ...NO_PUSH, messages } },
        { provide: AuthStore, useValue: { isAdmin } },
      ],
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'setAppBadge');
    Reflect.deleteProperty(navigator, 'clearAppBadge');
  });

  function withBadging() {
    const setAppBadge = vi.fn(() => Promise.resolve());
    const clearAppBadge = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: setAppBadge });
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: clearAppBadge });
    return { setAppBadge, clearAppBadge };
  }

  it('when a push message with open alerts arrives while the app is open, then the badge shows their count', () => {
    const badge = withBadging();
    TestBed.inject(AppBadge).start();

    messages.next({ v: 1, kind: 'mail-outage', count: 2 });

    expect(badge.setAppBadge).toHaveBeenCalledWith(2);
  });

  it('when a push message says no alert is open, then the badge is cleared', () => {
    const badge = withBadging();
    TestBed.inject(AppBadge).start();

    messages.next({ v: 1, kind: 'mail-recovered', count: 0 });

    expect(badge.clearAppBadge).toHaveBeenCalled();
    expect(badge.setAppBadge).not.toHaveBeenCalled();
  });

  it('when a test alert arrives while two alerts are open, then the badge keeps showing two', () => {
    const badge = withBadging();
    TestBed.inject(AppBadge).start();

    messages.next({ v: 1, kind: 'test', count: 2 });

    expect(badge.setAppBadge).toHaveBeenCalledWith(2);
    expect(badge.clearAppBadge).not.toHaveBeenCalled();
  });

  it('when the administrator signs out or loses the role, then the badge is cleared', () => {
    const badge = withBadging();
    isAdmin.set(true);
    TestBed.inject(AppBadge).start();
    TestBed.tick();

    expect(badge.clearAppBadge).not.toHaveBeenCalled();

    isAdmin.set(false);
    TestBed.tick();

    expect(badge.clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it('when the app starts without an administrator, then the badge is left as it is', () => {
    const badge = withBadging();
    TestBed.inject(AppBadge).start();
    TestBed.tick();

    expect(badge.clearAppBadge).not.toHaveBeenCalled();
  });

  it('when a malformed message arrives, then the badge stays as it was', () => {
    const badge = withBadging();
    TestBed.inject(AppBadge).start();

    messages.next({ kind: 'test', count: 'lots' });
    messages.next(null);
    messages.next('3');

    expect(badge.setAppBadge).not.toHaveBeenCalled();
    expect(badge.clearAppBadge).not.toHaveBeenCalled();
  });

  it('when the browser refuses the badge, then nothing throws', async () => {
    Object.defineProperty(navigator, 'setAppBadge', {
      configurable: true,
      value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    });
    Object.defineProperty(navigator, 'clearAppBadge', {
      configurable: true,
      value: () => {
        throw new TypeError('Illegal invocation');
      },
    });
    const appBadge = TestBed.inject(AppBadge);

    expect(() => appBadge.show(1)).not.toThrow();
    expect(() => appBadge.show(0)).not.toThrow();
    await Promise.resolve();
  });

  it('when the browser has no badge, then showing a count does nothing', () => {
    expect(() => TestBed.inject(AppBadge).show(3)).not.toThrow();
  });
});
