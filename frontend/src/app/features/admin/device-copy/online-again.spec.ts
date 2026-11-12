import { TestBed } from '@angular/core/testing';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { type OnlineAgain, reloadWhenOnlineAgain } from './online-again';
import { type FakeConnectivity, fakeConnectivity } from './testing/opened-copy';

describe('Given a card that waits for the server while the device is offline', () => {
  let connectivity: FakeConnectivity;
  let waiting: boolean;
  let reload: ReturnType<typeof vi.fn<() => void>>;

  function start(cause: 'network' | 'server' | null): OnlineAgain {
    connectivity = fakeConnectivity(cause);
    waiting = cause !== null;
    reload = vi.fn<() => void>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Connectivity,
          useValue: { offline: connectivity.offline, cause: connectivity.cause },
        },
      ],
    });
    const onlineAgain = TestBed.runInInjectionContext(() =>
      reloadWhenOnlineAgain(
        () => waiting,
        () => reload(),
      ),
    );
    TestBed.tick();
    return onlineAgain;
  }

  it('when the card starts, then it does not reload on its first run, online or offline', () => {
    start('network');
    expect(reload).not.toHaveBeenCalled();
    TestBed.resetTestingModule();

    start(null);
    expect(reload).not.toHaveBeenCalled();
  });

  it('when the device comes back online while the card waits, then the card reloads once', () => {
    start('network');

    connectivity.set(null);
    TestBed.tick();
    TestBed.tick();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('when the device comes back online while the card no longer waits, then nothing reloads', () => {
    start('network');
    waiting = false;

    connectivity.set(null);
    TestBed.tick();

    expect(reload).not.toHaveBeenCalled();
  });

  it('when the device stays online or only the cause changes, then nothing reloads', () => {
    start('network');

    connectivity.set('server');
    TestBed.tick();

    expect(reload).not.toHaveBeenCalled();
  });

  it('when a read fails, then the card waits only while the device is offline, and says whether the server is away', () => {
    const onlineAgain = start('server');
    expect(onlineAgain.offline()).toBe(true);
    expect(onlineAgain.serverAway()).toBe(true);

    connectivity.set('network');
    expect(onlineAgain.offline()).toBe(true);
    expect(onlineAgain.serverAway()).toBe(false);

    connectivity.set(null);
    expect(onlineAgain.offline()).toBe(false);
  });
});
