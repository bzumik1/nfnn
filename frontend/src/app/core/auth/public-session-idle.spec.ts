import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from './auth-store';
import { PUBLIC_ACTIVITY_KEY, PUBLIC_IDLE_MS, PublicSessionIdle } from './public-session-idle';
import { SessionKind } from './session-jar';
import { publicActivity, SESSION_CHANNEL } from './session-tabs';
import { FakeSessionChannel } from './testing/fake-session-tabs';
import { SignedOutNotice } from './signed-out-notice';

describe('Given a donor signed in on a public computer', () => {
  const session = signal<SessionKind | null>('PUBLIC');
  const logout = vi.fn(() => of(undefined));
  const navigateByUrl = vi.fn(() => Promise.resolve(true));
  let document: Document;
  let channel: FakeSessionChannel;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    channel = new FakeSessionChannel();
    session.set('PUBLIC');
    logout.mockClear();
    navigateByUrl.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session: session.asReadonly(), logout } },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: SESSION_CHANNEL, useValue: () => channel },
      ],
    });
    document = TestBed.inject(DOCUMENT);
    TestBed.inject(PublicSessionIdle).start();
    TestBed.tick();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('when an hour passes without a touch, a key or a click, then the donor is signed out and goes home with the signed-out notice', async () => {
    await vi.advanceTimersByTimeAsync(PUBLIC_IDLE_MS);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/');
    expect(TestBed.inject(SignedOutNotice).shown()).toBe(true);
  });

  it('when the donor presses a key before the hour is up, then the hour starts again from that key', async () => {
    await vi.advanceTimersByTimeAsync(PUBLIC_IDLE_MS - 60_000);
    document.dispatchEvent(new KeyboardEvent('keydown'));
    await vi.advanceTimersByTimeAsync(PUBLIC_IDLE_MS - 60_000);

    expect(logout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('when another tab of the session reports input, then the hour starts again from that input', async () => {
    await vi.advanceTimersByTimeAsync(PUBLIC_IDLE_MS - 60_000);
    channel.deliverFromAnotherTab(publicActivity(Date.now()));
    await vi.advanceTimersByTimeAsync(PUBLIC_IDLE_MS - 60_000);

    expect(logout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('when the donor presses a key, then the other tabs of the session hear of it', () => {
    document.dispatchEvent(new KeyboardEvent('keydown'));

    expect(channel.posted).toEqual([publicActivity(Date.now())]);
  });

  it('when the computer slept past the hour and the donor touches the page, then the touch signs out instead of keeping the session', async () => {
    vi.setSystemTime(Date.now() + PUBLIC_IDLE_MS + 1);
    document.dispatchEvent(new Event('pointerdown'));
    await vi.advanceTimersByTimeAsync(0);

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('when the donor signs out before the hour, then nothing signs out again later', async () => {
    session.set(null);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(PUBLIC_IDLE_MS * 2);

    expect(logout).not.toHaveBeenCalled();
  });
});

describe('Given a donor on a public computer whose tab reloads half an hour after the last input', () => {
  it('when another half hour passes without input, then the donor is signed out', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem(PUBLIC_ACTIVITY_KEY, String(Date.now() - PUBLIC_IDLE_MS / 2));
    const logout = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session: signal<SessionKind | null>('PUBLIC'), logout } },
        { provide: Router, useValue: { navigateByUrl: vi.fn(() => Promise.resolve(true)) } },
        { provide: SESSION_CHANNEL, useValue: () => null },
      ],
    });
    TestBed.inject(PublicSessionIdle).start();
    TestBed.tick();

    await vi.advanceTimersByTimeAsync(PUBLIC_IDLE_MS / 2 - 1_000);
    expect(logout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PUBLIC_ACTIVITY_KEY)).toBeNull();
    vi.useRealTimers();
    sessionStorage.clear();
  });
});

describe('Given a donor signed in for this browser session', () => {
  it('when an hour passes without input, then the session stays', async () => {
    vi.useFakeTimers();
    const logout = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthStore,
          useValue: { session: signal<SessionKind | null>('BROWSER'), logout },
        },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
        { provide: SESSION_CHANNEL, useValue: () => null },
      ],
    });
    TestBed.inject(PublicSessionIdle).start();
    TestBed.tick();

    await vi.advanceTimersByTimeAsync(PUBLIC_IDLE_MS * 2);

    expect(logout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
