import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth-interceptor';
import { AuthStore, SESSION_HINT_KEY } from './auth-store';
import { PasskeyAuthenticator } from './passkey-authenticator';
import {
  type DeviceAccount,
  deviceAccountOf,
  SESSION_DEVICE,
  type SessionDevice,
  type SignInSecret,
} from './session-device';
import { SESSION_CHANNEL, signedOut } from './session-tabs';
import { FakeSessionChannel } from './testing/fake-session-tabs';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeySignInOptions,
  problem,
  SAMPLE_ASSERTION,
  sampleDonor,
} from './testing/donor-fixtures';

const JANA = deviceAccountOf(sampleDonor());
const PETR_DONOR = sampleDonor({
  id: '01a18e56-bdb0-775a-bd0a-000000000002',
  email: 'petr@example.cz',
});
const PETR = deviceAccountOf(PETR_DONOR);
const PRF_INPUT = new Uint8Array(32).fill(3);

class RecordingDevice implements SessionDevice {
  readonly calls: [string, ...unknown[]][] = [];
  input: Uint8Array<ArrayBuffer> | null = PRF_INPUT;
  secrets: SignInSecret[] = [];
  storesNothing: boolean[] = [];
  deviceSecrets: (string | undefined)[] = [];

  async prfInput() {
    this.calls.push(['prfInput']);
    return this.input;
  }
  async signedIn(
    account: DeviceAccount,
    secret: SignInSecret,
    storeNothing = false,
    deviceSecret?: string,
  ) {
    this.calls.push(['signedIn', account, secret.kind]);
    this.secrets.push(secret);
    this.storesNothing.push(storeNothing);
    this.deviceSecrets.push(deviceSecret);
  }
  async restored(account: DeviceAccount, storeNothing = false) {
    this.calls.push(['restored', account]);
    this.storesNothing.push(storeNothing);
  }
  async signedOut(account: DeviceAccount) {
    this.calls.push(['signedOut', account]);
  }
  signedOutElsewhere() {
    this.calls.push(['signedOutElsewhere']);
  }
  async sessionLost() {
    this.calls.push(['sessionLost']);
  }
  async passwordChanged(account: DeviceAccount, password: string) {
    this.calls.push(['passwordChanged', account, password]);
  }
  async passwordRemoved(account: DeviceAccount) {
    this.calls.push(['passwordRemoved', account]);
  }
  async passkeyAdded(account: DeviceAccount) {
    this.calls.push(['passkeyAdded', account]);
  }
}

describe('Given the auth store on a device that keeps a copy of the donor data', () => {
  let store: AuthStore;
  let http: HttpTestingController;
  let device: RecordingDevice;
  let passkeys: FakePasskeyAuthenticator;
  let channel: FakeSessionChannel;

  beforeEach(() => {
    localStorage.clear();
    device = new RecordingDevice();
    passkeys = new FakePasskeyAuthenticator();
    channel = new FakeSessionChannel();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: passkeys },
        { provide: SESSION_DEVICE, useValue: device },
        { provide: SESSION_CHANNEL, useValue: () => channel },
      ],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function signIn(): void {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
    device.calls.length = 0;
  }

  it('when the donor signs in with a password, then the device opens her copy with that password', () => {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));

    expect(device.calls).toEqual([['signedIn', JANA, 'password']]);
    expect(device.secrets[0]).toEqual({ kind: 'password', password: 'correct horse battery' });
  });

  it('when the sign-in answer carries a device secret, then the device keeps it with the copy', () => {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush({ ...authResponse('token-1'), deviceSecret: 'd'.repeat(43) });

    expect(device.deviceSecrets).toEqual(['d'.repeat(43)]);
  });

  it('when the sign-in answer carries no device secret, then the device gets none', () => {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));

    expect(device.deviceSecrets).toEqual([undefined]);
  });

  it('when the second factor completes a password sign-in, then the device gets the password the dialog kept', () => {
    store.completeSecondFactor('c'.repeat(43), '287082', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login/second-factor').flush(authResponse('token-2'));

    expect(device.secrets).toEqual([{ kind: 'password', password: 'correct horse battery' }]);
  });

  it('when the second factor completes a sign-in without a password, then the device gets no secret', () => {
    store.completeSecondFactor('c'.repeat(43), '287082').subscribe();
    http.expectOne('/api/donors/auth/login/second-factor').flush(authResponse('token-2'));

    expect(device.secrets).toEqual([{ kind: 'none' }]);
  });

  it('when the donor signs in by the link from her e-mail, then the device gets no secret', () => {
    store.confirmEmail('t'.repeat(43)).subscribe();
    http.expectOne('/api/donors/auth/email-verification/confirm').flush(authResponse('token-3'));

    expect(device.secrets).toEqual([{ kind: 'none' }]);
  });

  describe('when the donor signs in with a passkey', () => {
    it('and the authenticator gives a PRF output, then the device input is asked first and the reading opens the copy', async () => {
      passkeys.prfOutput = new Uint8Array(32).fill(9);
      store.signInWithPasskey().subscribe();

      http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
      await vi.waitFor(() =>
        http.expectOne('/api/donors/auth/passkey').flush(authResponse('token-4')),
      );

      expect(passkeys.prfInputs).toEqual([PRF_INPUT]);
      expect(device.calls.map(([name]) => name)).toEqual(['prfInput', 'signedIn']);
      const secret = device.secrets[0];
      expect(secret.kind).toBe('prf');
      expect(secret.kind === 'prf' && secret.reading.credentialId).toBe(SAMPLE_ASSERTION.id);
    });

    it('and the authenticator gives no PRF output, then the device gets no secret', async () => {
      store.signInWithPasskey().subscribe();

      http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
      await vi.waitFor(() =>
        http.expectOne('/api/donors/auth/passkey').flush(authResponse('token-4')),
      );

      expect(device.secrets).toEqual([{ kind: 'none' }]);
    });

    it('and the device has no input to offer, then the passkey is asked without PRF', async () => {
      device.input = null;
      store.signInWithPasskey().subscribe();

      http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
      await vi.waitFor(() =>
        http.expectOne('/api/donors/auth/passkey').flush(authResponse('token-4')),
      );

      expect(passkeys.prfInputs).toEqual([null]);
    });

    it('and the server refuses the assertion, then the PRF output is zeroed and no copy opens', async () => {
      passkeys.prfOutput = new Uint8Array(32).fill(9);
      const outputs: Uint8Array[] = [];
      const getWithPrf = passkeys.getWithPrf.bind(passkeys);
      passkeys.getWithPrf = async (options, input) => {
        const answer = await getWithPrf(options, input);
        if (answer.prf !== null) {
          outputs.push(answer.prf.output);
        }
        return answer;
      };
      store.signInWithPasskey().subscribe({ error: () => undefined });

      http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
      await vi.waitFor(() =>
        http
          .expectOne('/api/donors/auth/passkey')
          .flush(problem('auth/invalid-passkey'), { status: 401, statusText: 'Unauthorized' }),
      );

      expect(outputs).toHaveLength(1);
      expect(outputs[0].every((byte) => byte === 0)).toBe(true);
      expect(device.secrets).toEqual([]);
    });
  });

  it('when a reload restores the session, then the device opens the copy by its session key', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const restoring = store.restore();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-5')),
    );
    await restoring;

    expect(device.calls).toEqual([['restored', JANA]]);
  });

  it('when the donor signs in on a public computer, then the device is told to store nothing', () => {
    store.login('jana@example.cz', 'correct horse battery', 'PUBLIC').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush({ ...authResponse('token-1'), session: 'PUBLIC' });

    expect(device.calls).toEqual([['signedIn', JANA, 'password']]);
    expect(device.storesNothing).toEqual([true]);
  });

  it('when the donor signs in for this browser session, then the device keeps the copy as usual', () => {
    store.login('jana@example.cz', 'correct horse battery', 'BROWSER').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush({ ...authResponse('token-1'), session: 'BROWSER' });

    expect(device.storesNothing).toEqual([false]);
  });

  it('when a reload restores a public-computer session, then the device is told to store nothing', async () => {
    sessionStorage.setItem(SESSION_HINT_KEY, '1');

    const restoring = store.restore();
    await vi.waitFor(() =>
      http
        .expectOne('/api/donors/auth/refresh')
        .flush({ ...authResponse('token-5'), session: 'PUBLIC' }),
    );
    await restoring;
    sessionStorage.clear();

    expect(device.calls).toEqual([['restored', JANA]]);
    expect(device.storesNothing).toEqual([true]);
  });

  it('when the session of a signed-in donor is refreshed, then the device is not asked again', async () => {
    signIn();

    store.refresh().subscribe();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-6')),
    );

    expect(device.calls).toEqual([]);
  });

  it('when the donor signs out, then the device closes the copy and keeps it', async () => {
    signIn();

    store.logout().subscribe();
    await vi.waitFor(() => http.expectOne('/api/donors/auth/logout').flush(null));

    expect(device.calls).toEqual([['signedOut', JANA]]);
  });

  it('when another tab signs out, then this tab closes the copy without deleting anything', () => {
    signIn();

    channel.deliverFromAnotherTab(signedOut());

    expect(device.calls).toEqual([['signedOutElsewhere']]);
  });

  it('when the server refuses the refresh, then the copy is closed and kept as after a sign-out', async () => {
    signIn();

    store.refresh().subscribe({ error: () => undefined });
    await vi.waitFor(() =>
      http
        .expectOne('/api/donors/auth/refresh')
        .flush(problem('auth/invalid-refresh-token'), { status: 401, statusText: 'Refused' }),
    );

    await vi.waitFor(() => expect(device.calls).toEqual([['signedOut', JANA]]));
  });

  it('when the server said the session ended and then refuses the refresh, then the copy is closed and kept as after a sign-out, never deleted', async () => {
    signIn();

    store.refresh().subscribe({ error: () => undefined });
    await vi.waitFor(() =>
      http
        .expectOne('/api/donors/auth/refresh')
        .flush(problem('auth/session-ended'), { status: 401, statusText: 'Refused' }),
    );

    await vi.waitFor(() => expect(device.calls).toEqual([['signedOut', JANA]]));
  });

  it('when a reload finds the session refused before any donor is known, then the device drops every session key it holds', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const restoring = store.restore();
    await vi.waitFor(() =>
      http
        .expectOne('/api/donors/auth/refresh')
        .flush(problem('auth/invalid-refresh-token'), { status: 401, statusText: 'Refused' }),
    );
    await restoring;

    expect(device.calls).toEqual([['sessionLost']]);
  });

  it('when a page opens with no session in this browser, then the device drops every session key it holds', async () => {
    await store.restore();

    expect(device.calls).toEqual([['sessionLost']]);
  });

  it('when a refresh answers for another donor, then the device opens the copy of the other, which closes the first', async () => {
    signIn();

    store.refresh().subscribe();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-10', PETR_DONOR)),
    );

    await vi.waitFor(() => expect(device.calls).toEqual([['restored', PETR]]));
  });

  it('when a passkey sign-in is abandoned after the authenticator answered, then the PRF output is zeroed', async () => {
    passkeys.prfOutput = new Uint8Array(32).fill(9);
    const outputs: Uint8Array[] = [];
    const getWithPrf = passkeys.getWithPrf.bind(passkeys);
    passkeys.getWithPrf = async (options, input) => {
      const answer = await getWithPrf(options, input);
      if (answer.prf !== null) {
        outputs.push(answer.prf.output);
      }
      return answer;
    };
    const signingIn = store.signInWithPasskey().subscribe();

    http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
    await vi.waitFor(() => http.expectOne('/api/donors/auth/passkey'));
    signingIn.unsubscribe();

    expect(outputs).toHaveLength(1);
    expect(outputs[0].every((byte) => byte === 0)).toBe(true);
    expect(device.secrets).toEqual([]);
  });

  it('when the donor changes her password, then the copy is wrapped with the new one', () => {
    signIn();

    store.changePassword({ currentPassword: 'old', newPassword: 'nové heslo 2026' }).subscribe();
    http.expectOne('/api/donors/me/password').flush(authResponse('token-8'));

    expect(device.calls).toEqual([['passwordChanged', JANA, 'nové heslo 2026']]);
  });

  it('when the donor removes her password, then the password wrap of the copy goes too', () => {
    signIn();

    store.removePassword({ password: 'old' }).subscribe();
    http.expectOne('/api/donors/me/password/remove').flush(authResponse('token-9'));

    expect(device.calls).toEqual([['passwordRemoved', JANA]]);
  });
});

describe('Given an administrator signed in on a device that keeps copies, whose calls pass the auth interceptor', () => {
  let http: HttpTestingController;
  let device: RecordingDevice;

  beforeEach(() => {
    localStorage.clear();
    device = new RecordingDevice();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: new FakePasskeyAuthenticator() },
        { provide: SESSION_DEVICE, useValue: device },
        { provide: SESSION_CHANNEL, useValue: () => new FakeSessionChannel() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
    device.calls.length = 0;
  });

  afterEach(() => http.verify());

  it('when the administration answers 403, then the device is told nothing, so no copy is closed or deleted', () => {
    TestBed.inject(HttpClient)
      .get('/api/admin/donations/sync')
      .subscribe({ error: () => undefined });

    http
      .expectOne('/api/admin/donations/sync')
      .flush(problem('auth/forbidden'), { status: 403, statusText: 'Forbidden' });

    expect(device.calls).toEqual([]);
  });
});
