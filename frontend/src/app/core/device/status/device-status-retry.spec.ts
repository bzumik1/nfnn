import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SESSION_DEVICE, NO_SESSION_DEVICE } from '../../auth/session-device';
import { Connectivity } from '../../connectivity/connectivity';
import { DeviceStatusRetry } from './device-status-retry';

describe('Given the retry of the device status questions when the connection returns', () => {
  let offline: ReturnType<typeof signal<boolean>>;
  let connectionReturned: ReturnType<typeof vi.fn<() => Promise<void>>>;

  function start(initiallyOffline: boolean): void {
    offline = signal(initiallyOffline);
    connectionReturned = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: Connectivity, useValue: { offline: offline.asReadonly() } },
        { provide: SESSION_DEVICE, useValue: { ...NO_SESSION_DEVICE, connectionReturned } },
      ],
    });
    TestBed.inject(DeviceStatusRetry).start();
    TestBed.tick();
  }

  it('when the app starts online and stays online, then the device is not asked to retry', () => {
    start(false);

    expect(connectionReturned).not.toHaveBeenCalled();
  });

  it('when the app goes offline and the connection returns, then the device retries once for that return', () => {
    start(false);
    offline.set(true);
    TestBed.tick();
    expect(connectionReturned).not.toHaveBeenCalled();

    offline.set(false);
    TestBed.tick();
    TestBed.tick();

    expect(connectionReturned).toHaveBeenCalledTimes(1);
  });

  it('when the app starts offline and the connection then comes, then the device retries', () => {
    start(true);

    offline.set(false);
    TestBed.tick();

    expect(connectionReturned).toHaveBeenCalledTimes(1);
  });

  it('when the connection drops and returns twice, then the device retries at each return', () => {
    start(false);
    for (const state of [true, false, true, false]) {
      offline.set(state);
      TestBed.tick();
    }

    expect(connectionReturned).toHaveBeenCalledTimes(2);
  });

  it('when the session device cannot retry, then a returning connection does nothing', () => {
    offline = signal(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: Connectivity, useValue: { offline: offline.asReadonly() } },
        { provide: SESSION_DEVICE, useValue: NO_SESSION_DEVICE },
      ],
    });
    TestBed.inject(DeviceStatusRetry).start();
    TestBed.tick();

    offline.set(false);

    expect(() => TestBed.tick()).not.toThrow();
  });
});
