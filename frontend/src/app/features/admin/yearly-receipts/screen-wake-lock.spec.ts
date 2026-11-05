import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { SCREEN_WAKE_LOCKS, ScreenWakeLock, WakeLockSentinelLike } from './screen-wake-lock';

class FakeSentinel implements WakeLockSentinelLike {
  released = false;

  release(): Promise<void> {
    this.released = true;
    return Promise.resolve();
  }
}

describe('Given a page that keeps the screen on while it works', () => {
  let sentinels: FakeSentinel[];
  let refuse: boolean;
  let visibility: DocumentVisibilityState;

  function setUp(available: boolean): ScreenWakeLock {
    TestBed.configureTestingModule({
      providers: [
        ScreenWakeLock,
        {
          provide: SCREEN_WAKE_LOCKS,
          useValue: available
            ? {
                request: () => {
                  if (refuse) {
                    return Promise.reject(new DOMException('denied', 'NotAllowedError'));
                  }
                  const sentinel = new FakeSentinel();
                  sentinels.push(sentinel);
                  return Promise.resolve(sentinel);
                },
              }
            : null,
        },
      ],
    });
    const document = TestBed.inject(DOCUMENT);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    return TestBed.inject(ScreenWakeLock);
  }

  function becomeVisible(state: DocumentVisibilityState): void {
    visibility = state;
    TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    sentinels = [];
    refuse = false;
    visibility = 'visible';
  });

  afterEach(() => vi.restoreAllMocks());

  it('when it starts holding the lock, then the screen lock is requested once', async () => {
    const lock = setUp(true);

    lock.hold();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));

    expect(sentinels[0].released).toBe(false);
  });

  it('when it lets go, then the lock is released and a later return to the tab asks for none', async () => {
    const lock = setUp(true);
    lock.hold();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));

    lock.release();
    becomeVisible('hidden');
    becomeVisible('visible');
    await Promise.resolve();

    expect(sentinels[0].released).toBe(true);
    expect(sentinels).toHaveLength(1);
  });

  it('when the tab comes back while it still holds, then the lock the browser dropped is asked for again', async () => {
    const lock = setUp(true);
    lock.hold();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));

    becomeVisible('hidden');
    becomeVisible('visible');

    await vi.waitFor(() => expect(sentinels).toHaveLength(2));
    lock.release();
    await vi.waitFor(() => expect(sentinels[1].released).toBe(true));
  });

  it('when it lets go before the browser answered, then the late lock is released at once', async () => {
    const lock = setUp(true);

    lock.hold();
    lock.release();

    await vi.waitFor(() => expect(sentinels[0]?.released).toBe(true));
  });

  it('when the browser refuses the lock, then the work goes on without it', async () => {
    refuse = true;
    const lock = setUp(true);

    expect(() => lock.hold()).not.toThrow();
    await Promise.resolve();
    expect(() => lock.release()).not.toThrow();
  });

  it('when the browser has no screen lock, then holding and letting go do nothing', () => {
    const lock = setUp(false);

    expect(() => {
      lock.hold();
      lock.release();
    }).not.toThrow();
  });
});
