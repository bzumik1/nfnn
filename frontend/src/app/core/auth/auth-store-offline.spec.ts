import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Connectivity, PROBE_PATH } from '../connectivity/connectivity';
import { authInterceptor } from './auth-interceptor';
import { AuthStore } from './auth-store';
import { copyProfileOf } from './copy-profile';
import {
  type DeviceAccount,
  deviceAccountOf,
  NO_SESSION_DEVICE,
  type OfflineAccount,
  SESSION_DEVICE,
  type SessionDevice,
} from './session-device';
import { APP_JAR, BROWSER_JAR, SESSION_JAR, type SessionKind } from './session-jar';
import { authResponse, problem, sampleDonor } from './testing/donor-fixtures';

const JANA_DONOR = sampleDonor({ roles: ['DONOR'] });
const JANA = deviceAccountOf(JANA_DONOR);
const REMEMBERED_COPY: OfflineAccount = {
  profile: copyProfileOf(JANA_DONOR),
  session: { kind: 'REMEMBERED', acceptedAt: '2026-11-10T08:00:00.000Z' },
};

class OfflineDevice implements SessionDevice {
  readonly calls: [string, ...unknown[]][] = [];
  opening: OfflineAccount | null = REMEMBERED_COPY;

  async openedOffline(expected: SessionKind) {
    this.calls.push(['openedOffline', expected]);
    return this.opening;
  }
  prfInput = NO_SESSION_DEVICE.prfInput;
  signedIn = NO_SESSION_DEVICE.signedIn;
  async restored(account: DeviceAccount) {
    this.calls.push(['restored', account]);
  }
  async signedOut(account: DeviceAccount) {
    this.calls.push(['signedOut', account]);
  }
  signedOutElsewhere = NO_SESSION_DEVICE.signedOutElsewhere;
  async sessionLost() {
    this.calls.push(['sessionLost']);
  }
  passwordChanged = NO_SESSION_DEVICE.passwordChanged;
  passwordRemoved = NO_SESSION_DEVICE.passwordRemoved;
  passkeyAdded = NO_SESSION_DEVICE.passkeyAdded;
}

describe('Given the auth store of a remembered session on a device that keeps a copy', () => {
  let http: HttpTestingController;
  let device: OfflineDevice;

  function setUp(jar = BROWSER_JAR): AuthStore {
    localStorage.clear();
    localStorage.setItem(jar.hintKey, '1');
    device = new OfflineDevice();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SESSION_DEVICE, useValue: device },
        { provide: SESSION_JAR, useValue: jar },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthStore);
  }

  function goOffline(): TestRequest {
    TestBed.inject(Connectivity);
    window.dispatchEvent(new Event('offline'));
    return http.expectOne(PROBE_PATH);
  }

  function comeBack(probe: TestRequest): void {
    probe.flush({});
    TestBed.inject(Connectivity).answered({
      status: 200,
      headers: new HttpHeaders(),
      fromNetwork: true,
    });
    TestBed.tick();
  }

  afterEach(() => http.verify());

  describe('when the app starts offline', () => {
    let store: AuthStore;
    let probe: TestRequest;

    beforeEach(() => {
      store = setUp();
      probe = goOffline();
    });

    it('then the restore opens the copy for the session it expects and shows the account from it, without a token or a request', async () => {
      await store.restore();

      expect(device.calls).toEqual([['openedOffline', 'REMEMBERED']]);
      expect(store.status()).toBe('signed-in');
      expect(store.fromDevice()).toBe(true);
      expect(store.session()).toBe('REMEMBERED');
      expect(store.donor()).toMatchObject(REMEMBERED_COPY.profile);
      expect(store.isAdmin()).toBe(false);
      expect(store.currentAccessToken()).toBeNull();
      expect(store.sessionAcceptedAt()).toBeNull();
      http.expectNone('/api/donors/auth/refresh');
      probe.error(new ProgressEvent('error'), { status: 0 });
    });

    it('and the device opens nothing, then the visitor waits signed out with the hint kept', async () => {
      device.opening = null;

      await store.restore();

      expect(store.status()).toBe('anonymous');
      expect(store.fromDevice()).toBe(false);
      expect(localStorage.getItem(BROWSER_JAR.hintKey)).toBe('1');
      probe.error(new ProgressEvent('error'), { status: 0 });
    });

    it('and the page asks again while the account shows from the copy, then the device is not asked twice', async () => {
      await store.restore();
      await store.restore();

      expect(device.calls).toEqual([['openedOffline', 'REMEMBERED']]);
      probe.error(new ProgressEvent('error'), { status: 0 });
    });

    it('and the connection comes back and the server accepts the refresh, then the session is the live one and the device restores the same account', async () => {
      await store.restore();

      comeBack(probe);
      await vi.waitFor(() =>
        http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-1', JANA_DONOR)),
      );

      expect(store.fromDevice()).toBe(false);
      expect(store.currentAccessToken()).toBe('token-1');
      expect(store.sessionAcceptedAt()).not.toBeNull();
      expect(device.calls).toEqual([
        ['openedOffline', 'REMEMBERED'],
        ['restored', JANA],
      ]);
    });

    it('and the connection comes back and the server refuses the refresh, then the donor is signed out and the device ends the session of the copy', async () => {
      await store.restore();

      comeBack(probe);
      await vi.waitFor(() =>
        http.expectOne('/api/donors/auth/refresh').flush(problem('auth/invalid-refresh-token'), {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      expect(store.status()).toBe('anonymous');
      expect(store.fromDevice()).toBe(false);
      expect(localStorage.getItem(BROWSER_JAR.hintKey)).toBeNull();
      expect(device.calls).toEqual([
        ['openedOffline', 'REMEMBERED'],
        ['signedOut', JANA],
      ]);
    });

    it('and the donor signs out while the server cannot be reached, then the hint goes and the device ends the session of the copy', async () => {
      await store.restore();

      let done = false;
      store.logout().subscribe(() => (done = true));
      await vi.waitFor(() =>
        http.expectOne('/api/donors/auth/logout').error(new ProgressEvent('error'), { status: 0 }),
      );
      await vi.waitFor(() => expect(done).toBe(true));

      expect(store.status()).toBe('anonymous');
      expect(localStorage.getItem(BROWSER_JAR.hintKey)).toBeNull();
      expect(device.calls).toEqual([
        ['openedOffline', 'REMEMBERED'],
        ['signedOut', JANA],
      ]);
      probe.error(new ProgressEvent('error'), { status: 0 });
    });
  });

  it('when the app starts and the server cannot be reached, then the restore opens the account from the copy', async () => {
    const store = setUp();

    const restored = store.restore();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').error(new ProgressEvent('error'), { status: 0 }),
    );
    await restored;

    expect(store.fromDevice()).toBe(true);
    expect(store.donor()?.id).toBe(JANA_DONOR.id);
    http.match(PROBE_PATH).forEach((probe) => probe.flush({}));
    http
      .match('/api/donors/auth/refresh')
      .forEach((refresh) => refresh.error(new ProgressEvent('error'), { status: 0 }));
  });

  it('when the app starts and the server refuses the refresh, then nothing opens from the copy', async () => {
    const store = setUp();

    const restored = store.restore();
    await vi.waitFor(() =>
      http
        .expectOne('/api/donors/auth/refresh')
        .flush(problem('auth/invalid-refresh-token'), { status: 401, statusText: 'Unauthorized' }),
    );
    await restored;

    expect(store.status()).toBe('anonymous');
    expect(device.calls.some(([call]) => call === 'openedOffline')).toBe(false);
  });

  it('when the installed app starts offline, then it asks the device for the copy of an app session', async () => {
    const store = setUp(APP_JAR);
    device.opening = { ...REMEMBERED_COPY, session: { ...REMEMBERED_COPY.session, kind: 'APP' } };
    const probe = goOffline();

    await store.restore();

    expect(device.calls).toEqual([['openedOffline', 'APP']]);
    expect(store.session()).toBe('APP');
    probe.error(new ProgressEvent('error'), { status: 0 });
  });

  it('when the account shows from the copy and a page calls the API, then the call waits for a refresh and carries the new token', async () => {
    const store = setUp();
    const restored = store.restore();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').error(new ProgressEvent('error'), { status: 0 }),
    );
    await restored;
    http.match(PROBE_PATH).forEach((probe) => probe.flush({}));
    http
      .match('/api/donors/auth/refresh')
      .forEach((refresh) => refresh.error(new ProgressEvent('error'), { status: 0 }));

    TestBed.inject(HttpClient).get('/api/donations/me').subscribe();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2', JANA_DONOR)),
    );

    const call = await vi.waitFor(() => http.expectOne('/api/donations/me'));
    expect(call.request.headers.get('Authorization')).toBe('Bearer token-2');
    call.flush({});
  });
});
