import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdministrationAccess } from './administration-access';
import { AuthStore, SESSION_HINT_KEY } from './auth-store';
import { Donor } from './donor';
import { PasskeyAuthenticator } from './passkey-authenticator';
import { TimeoutError } from 'rxjs';
import {
  REFRESH_LOCK_WAIT_MS,
  REFRESH_REQUEST_TIMEOUT_MS,
  SESSION_CHANNEL,
  sessionRefreshed,
  signedOut,
  SLOW_RESTORE_PAUSE_MS,
  TAB_LOCKS,
} from './session-tabs';
import { FakeSessionChannel, FakeTabLocks } from './testing/fake-session-tabs';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeySignInOptions,
  problem,
  SAMPLE_ASSERTION,
  SAMPLE_CHALLENGE,
  sampleDonor,
} from './testing/donor-fixtures';

const PENDING = { newEmail: 'jana.nova@example.cz', expiresAt: '2026-10-18T12:00:00Z' };

describe('Given the auth store', () => {
  let store: AuthStore;
  let http: HttpTestingController;
  let passkeys: FakePasskeyAuthenticator;

  beforeEach(() => {
    localStorage.clear();
    passkeys = new FakePasskeyAuthenticator();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: passkeys },
      ],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function signIn(token = 'token-1'): void {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse(token));
  }

  it('when a donor with the ADMIN role signs in, then the store says so, and not for a plain donor', () => {
    expect(store.isAdmin()).toBe(false);
    signIn();
    expect(store.isAdmin()).toBe(false);

    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-2', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));

    expect(store.isAdmin()).toBe(true);
  });

  it('when a passkey signs in, then the browser answers the challenge of the server and the session is adopted', async () => {
    const signedIn = vi.fn();
    store.signInWithPasskey().subscribe(signedIn);

    http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
    await vi.waitFor(() => expect(passkeys.requested).toHaveLength(1));
    const request = http.expectOne('/api/donors/auth/passkey');
    expect(request.request.body).toEqual({
      challenge: SAMPLE_CHALLENGE,
      credential: SAMPLE_ASSERTION,
      session: 'BROWSER',
    });
    request.flush(authResponse('token-3', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));

    expect(signedIn).toHaveBeenCalled();
    expect(store.currentAccessToken()).toBe('token-3');
    expect(store.isAdmin()).toBe(true);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('when the donor dismisses the passkey prompt, then nothing is sent and no session opens', async () => {
    passkeys.failure = 'cancelled';
    const failed = vi.fn();
    store.signInWithPasskey().subscribe({ error: failed });

    http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
    await vi.waitFor(() => expect(failed).toHaveBeenCalled());

    http.expectNone('/api/donors/auth/passkey');
    expect(store.signedIn()).toBe(false);
  });

  it('when the second factor completes a sign-in, then the session is adopted like after a password sign-in', () => {
    store.completeSecondFactor('c'.repeat(43), '287082').subscribe();

    const request = http.expectOne('/api/donors/auth/login/second-factor');
    expect(request.request.body).toEqual({
      challenge: 'c'.repeat(43),
      code: '287082',
      session: 'BROWSER',
    });
    request.flush(
      authResponse(
        'token-2',
        sampleDonor({ secondFactor: { enabled: true, neededForAdministration: false } }),
      ),
    );

    expect(store.donor()?.secondFactor.enabled).toBe(true);
    expect(store.currentAccessToken()).toBe('token-2');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('when the second factor is turned on or off, then the session the server opened replaces the current one', () => {
    signIn();

    store.confirmSecondFactor('287082').subscribe();
    http.expectOne('/api/donors/me/second-factor/confirm').flush(authResponse('token-2'));
    expect(store.currentAccessToken()).toBe('token-2');

    store.disableSecondFactor({ password: 'correct horse battery', code: '287082' }).subscribe();
    http.expectOne('/api/donors/me/second-factor/disable').flush(authResponse('token-3'));
    expect(store.currentAccessToken()).toBe('token-3');
  });

  it('when a donor signs in, then the profile and the access token are kept and a session hint is remembered', () => {
    let signedIn: Donor | undefined;
    store
      .login('jana@example.cz', 'correct horse battery')
      .subscribe((donor) => (signedIn = donor));

    const request = http.expectOne('/api/donors/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      email: 'jana@example.cz',
      password: 'correct horse battery',
      session: 'BROWSER',
    });
    request.flush(authResponse('token-1'));

    expect(signedIn?.name).toBe('Jana Nováková');
    expect(store.donor()?.variableSymbol).toBe('1234567890');
    expect(store.signedIn()).toBe(true);
    expect(store.status()).toBe('signed-in');
    expect(store.currentAccessToken()).toBe('token-1');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('when a donor registers, then the request carries the whole registration and nobody is signed in yet', () => {
    store
      .register({
        type: 'COMPANY',
        name: 'Stavby Novák s.r.o.',
        companyIdentifier: '45274649',
        address: { street: 'Průmyslová 5', city: 'Teplice', postalCode: '415 01' },
        email: 'ucetni@stavby.example.cz',
        password: 'correct horse battery',
        preferredLocale: 'cs',
      })
      .subscribe();

    const request = http.expectOne('/api/donors/auth/register');
    expect(request.request.body.type).toBe('COMPANY');
    expect(request.request.body.companyIdentifier).toBe('45274649');
    request.flush(null, { status: 202, statusText: 'Accepted' });

    expect(store.signedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('when a donor confirms the e-mail with the link, then the token is sent and the donor is signed in', () => {
    store.confirmEmail('abc').subscribe();

    const request = http.expectOne('/api/donors/auth/email-verification/confirm');
    expect(request.request.body).toEqual({ token: 'abc', session: 'BROWSER' });
    request.flush(authResponse('token-1'));

    expect(store.signedIn()).toBe(true);
    expect(store.currentAccessToken()).toBe('token-1');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('when the session is restored with a hint present, then the session is refreshed and the donor is signed in', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const restored = store.restore();
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2'));
    await restored;

    expect(store.donor()?.email).toBe('jana@example.cz');
    expect(store.currentAccessToken()).toBe('token-2');
  });

  it('when the session is restored without a hint, then nothing is requested and the visitor is anonymous', async () => {
    await store.restore();

    http.expectNone('/api/donors/auth/refresh');
    expect(store.status()).toBe('anonymous');
    expect(store.signedIn()).toBe(false);
  });

  it('when the refresh is refused, then the visitor is anonymous and the hint is dropped', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const restored = store.restore();
    http
      .expectOne('/api/donors/auth/refresh')
      .flush(problem('auth/invalid-refresh-token'), { status: 401, statusText: 'Unauthorized' });
    await restored;

    expect(store.status()).toBe('anonymous');
    expect(store.donor()).toBeNull();
    expect(store.currentAccessToken()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('when two refreshes overlap, then only one request is sent and both get the new token', () => {
    const tokens: string[] = [];
    store.refresh().subscribe((token) => tokens.push(token));
    store.refresh().subscribe((token) => tokens.push(token));

    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-3'));

    expect(tokens).toEqual(['token-3', 'token-3']);
    expect(store.currentAccessToken()).toBe('token-3');
  });

  it('when the donor signs out, then the session is forgotten even if the server fails', () => {
    signIn();

    store.logout().subscribe();
    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(store.donor()).toBeNull();
    expect(store.currentAccessToken()).toBeNull();
    expect(store.status()).toBe('anonymous');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('when the donor signs in here and then signs out, then the administration of this tab unlocks with the sign-in and locks again with the sign-out', () => {
    const access = TestBed.inject(AdministrationAccess);
    signIn();
    expect(access.unlocked()).toBe(true);

    store.logout().subscribe();
    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });

    expect(access.unlocked()).toBe(false);
  });

  it('when the profile is updated, then the store shows the new profile', () => {
    signIn();

    store.updateProfile({ name: 'Jana Svobodová' }).subscribe();
    const request = http.expectOne('/api/donors/me');
    expect(request.request.method).toBe('PATCH');
    request.flush({ ...authResponse('token-1').user, name: 'Jana Svobodová' });

    expect(store.donor()?.name).toBe('Jana Svobodová');
  });

  it('when the password is changed, then the store adopts the new session it answers with', () => {
    signIn();

    store
      .changePassword({
        currentPassword: 'correct horse battery',
        newPassword: 'a brand new passphrase',
      })
      .subscribe();
    const request = http.expectOne('/api/donors/me/password');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      currentPassword: 'correct horse battery',
      newPassword: 'a brand new passphrase',
    });
    request.flush(authResponse('token-2'));

    expect(store.signedIn()).toBe(true);
    expect(store.currentAccessToken()).toBe('token-2');
  });

  it('when an e-mail change is requested, then the request goes out and the store keeps the current address with the pending one beside it', () => {
    signIn();

    store
      .requestEmailChange({ newEmail: 'jana.nova@example.cz', password: 'correct horse battery' })
      .subscribe();
    const request = http.expectOne('/api/donors/me/email-change');
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 202, statusText: 'Accepted' });
    const profile = http.expectOne({ method: 'GET', url: '/api/donors/me' });
    profile.flush(sampleDonor({ pendingEmailChange: PENDING }));

    expect(store.donor()?.email).toBe('jana@example.cz');
    expect(store.donor()?.pendingEmailChange).toEqual(PENDING);
  });

  it('when the profile cannot be loaded after the e-mail change, then the change still counts as sent and the donor stays as it was', () => {
    signIn();
    let sent = false;
    let failed = false;

    store.requestEmailChange({ newEmail: 'jana.nova@example.cz', password: 'x' }).subscribe({
      next: () => (sent = true),
      error: () => (failed = true),
    });
    http
      .expectOne('/api/donors/me/email-change')
      .flush(null, { status: 202, statusText: 'Accepted' });
    http
      .expectOne({ method: 'GET', url: '/api/donors/me' })
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(sent).toBe(true);
    expect(failed).toBe(false);
    expect(store.donor()?.email).toBe('jana@example.cz');
  });

  it('when the change link is sent again, then the request goes out and the store takes the new expiry', () => {
    signIn();

    store.resendEmailChange().subscribe();
    const request = http.expectOne('/api/donors/me/email-change/resend');
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 202, statusText: 'Accepted' });
    const later = { ...PENDING, expiresAt: '2026-10-19T12:00:00Z' };
    http
      .expectOne({ method: 'GET', url: '/api/donors/me' })
      .flush(sampleDonor({ pendingEmailChange: later }));

    expect(store.donor()?.pendingEmailChange).toEqual(later);
  });

  it('when the e-mail change is cancelled, then the request goes out and the store holds no pending change', () => {
    signIn();

    store.cancelEmailChange().subscribe();
    const request = http.expectOne('/api/donors/me/email-change');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne({ method: 'GET', url: '/api/donors/me' }).flush(sampleDonor());

    expect(store.donor()?.pendingEmailChange).toBeNull();
  });
});

describe('Given the auth store in one of several tabs of the browser', () => {
  let store: AuthStore;
  let http: HttpTestingController;
  let locks: FakeTabLocks;
  let channel: FakeSessionChannel;

  beforeEach(() => {
    localStorage.clear();
    locks = new FakeTabLocks();
    channel = new FakeSessionChannel();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: new FakePasskeyAuthenticator() },
        { provide: TAB_LOCKS, useValue: locks },
        { provide: SESSION_CHANNEL, useValue: () => channel },
      ],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('when the waiting for the lock may last longer than the refresh request, then the request is always aborted before another tab gets the lock', () => {
    expect(REFRESH_LOCK_WAIT_MS).toBeGreaterThan(REFRESH_REQUEST_TIMEOUT_MS);
  });

  it('when the session is refreshed, then the request runs under the refresh lock and the new session is announced to the other tabs', async () => {
    const tokens: string[] = [];
    store.refresh().subscribe((token) => tokens.push(token));

    await vi.waitFor(() => expect(locks.isHeld).toBe(true));
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-2'));

    await vi.waitFor(() => expect(locks.isHeld).toBe(false));
    expect(locks.requested).toEqual(['nfnn-refresh']);
    expect(tokens).toEqual(['token-2']);
    expect(channel.posted).toEqual([
      { kind: 'session-refreshed', version: 1, response: authResponse('token-2') },
    ]);
  });

  it('when another tab holds the refresh lock, then this tab sends no refresh until the lock is released', async () => {
    const release = locks.holdForAnotherTab();
    await vi.waitFor(() => expect(locks.isHeld).toBe(true));
    const tokens: string[] = [];

    store.refresh().subscribe((token) => tokens.push(token));
    await vi.waitFor(() => expect(locks.waitingCount).toBe(1));
    http.expectNone('/api/donors/auth/refresh');

    release();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-3')),
    );
    await vi.waitFor(() => expect(tokens).toEqual(['token-3']));
  });

  it('when two tabs restore the session at once, then only the first one asks the server and the second takes the session it announced', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    const release = locks.holdForAnotherTab();
    await vi.waitFor(() => expect(locks.isHeld).toBe(true));

    const restored = store.restore();
    await vi.waitFor(() => expect(locks.waitingCount).toBe(1));
    channel.deliverFromAnotherTab(sessionRefreshed(authResponse('token-4')));
    release();
    await restored;

    http.expectNone('/api/donors/auth/refresh');
    expect(store.signedIn()).toBe(true);
    expect(store.currentAccessToken()).toBe('token-4');
    expect(channel.posted).toEqual([]);
  });

  it('when another tab announces a fresh session, then this tab takes it over', () => {
    channel.deliverFromAnotherTab(
      sessionRefreshed(authResponse('token-5', sampleDonor({ roles: ['DONOR', 'ADMIN'] }))),
    );

    expect(store.status()).toBe('signed-in');
    expect(store.isAdmin()).toBe(true);
    expect(store.currentAccessToken()).toBe('token-5');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('when a message on the session channel is not an announced session, then it changes nothing', () => {
    for (const message of [
      null,
      'session-refreshed',
      { kind: 'session-refreshed', version: 1 },
      { kind: 'session-refreshed', response: authResponse('token-6') },
      { kind: 'session-refreshed', version: 2, response: authResponse('token-6') },
      {
        ...sessionRefreshed(authResponse('token-6')),
        response: { ...authResponse(''), user: sampleDonor() },
      },
      {
        ...sessionRefreshed(authResponse('token-6')),
        response: { ...authResponse('token-6'), user: null },
      },
      {
        ...sessionRefreshed(authResponse('token-6')),
        response: { ...authResponse('token-6'), user: { ...sampleDonor(), roles: undefined } },
      },
      {
        ...sessionRefreshed(authResponse('token-6')),
        response: { ...authResponse('token-6'), user: { ...sampleDonor(), id: 7 } },
      },
      {
        ...sessionRefreshed(authResponse('token-6')),
        response: { user: sampleDonor(), accessToken: 'token-6' },
      },
      { kind: 'session-refreshed-later', version: 1, response: authResponse('token-7') },
    ]) {
      channel.deliverFromAnotherTab(message);
    }

    expect(store.signedIn()).toBe(false);
    expect(store.currentAccessToken()).toBeNull();
  });

  it('when the refresh gets no answer in time, then the request is aborted before the lock is released and the session is kept for the next try', async () => {
    signInFirst();
    vi.useFakeTimers();
    let failure: unknown;
    store.refresh().subscribe({ error: (reason: unknown) => (failure = reason) });
    await vi.advanceTimersByTimeAsync(0);
    const request = http.expectOne('/api/donors/auth/refresh');
    let cancelledAtRelease: boolean | undefined;
    locks.onRelease = () => (cancelledAtRelease = request.cancelled);

    await vi.advanceTimersByTimeAsync(REFRESH_REQUEST_TIMEOUT_MS);

    expect(cancelledAtRelease).toBe(true);
    expect(request.cancelled).toBe(true);
    expect(failure).toBeInstanceOf(TimeoutError);
    expect(locks.isHeld).toBe(false);
    expect(store.signedIn()).toBe(true);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('when another tab keeps the lock too long, then the refresh gives up without a request and keeps the session', async () => {
    signInFirst();
    locks.holdForAnotherTab();
    vi.useFakeTimers();
    let failure: unknown;
    store.refresh().subscribe({ error: (reason: unknown) => (failure = reason) });

    await vi.advanceTimersByTimeAsync(REFRESH_LOCK_WAIT_MS);

    http.expectNone('/api/donors/auth/refresh');
    expect((failure as DOMException).name).toBe('AbortError');
    expect(locks.waitingCount).toBe(0);
    expect(store.signedIn()).toBe(true);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('when a restore gets no answer from the server, then the visitor waits signed out, the hint stays and the next restore tries again', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');

    const first = store.restore();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').error(new ProgressEvent('error'), { status: 0 }),
    );
    await first;

    expect(store.status()).toBe('anonymous');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');

    const second = store.restore();
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-8')),
    );
    await second;
    expect(store.currentAccessToken()).toBe('token-8');
  });

  it('when the server refuses the refresh as a replay, then only the session ends and nothing else the browser keeps is deleted', async () => {
    signInFirst();
    localStorage.setItem('nfnn.receipt-keys', '{"keys":[]}');

    let failure: unknown;
    store.refresh().subscribe({ error: (reason: unknown) => (failure = reason) });
    await vi.waitFor(() =>
      http
        .expectOne('/api/donors/auth/refresh')
        .flush(problem('auth/invalid-refresh-token'), { status: 401, statusText: 'Unauthorized' }),
    );
    await vi.waitFor(() => expect(failure).toBeDefined());

    expect(store.signedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    expect(localStorage.getItem('nfnn.receipt-keys')).toBe('{"keys":[]}');
  });

  it('when the only caller leaves while the refresh is on its way, then the request still runs to its answer, the session is adopted and the lock released', async () => {
    signInFirst();
    const caller = store.refresh().subscribe();
    await vi.waitFor(() => expect(locks.isHeld).toBe(true));
    const request = http.expectOne('/api/donors/auth/refresh');

    caller.unsubscribe();

    expect(request.cancelled).toBe(false);
    request.flush(authResponse('token-9'));
    await vi.waitFor(() => expect(locks.isHeld).toBe(false));
    expect(store.currentAccessToken()).toBe('token-9');
    expect(channel.posted).toEqual([sessionRefreshed(authResponse('token-9'))]);
  });

  it('when the only caller leaves while this tab waits for the lock, then the refresh still runs once the lock is free', async () => {
    signInFirst();
    const release = locks.holdForAnotherTab();
    const caller = store.refresh().subscribe();
    await vi.waitFor(() => expect(locks.waitingCount).toBe(1));

    caller.unsubscribe();
    release();

    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-10')),
    );
    await vi.waitFor(() => expect(store.currentAccessToken()).toBe('token-10'));
  });

  describe.each([400, 401, 403])('when the server refuses the refresh with status %i', (status) => {
    it('then the session and its hint are forgotten', async () => {
      signInFirst();
      store.refresh().subscribe({ error: () => undefined });
      await vi.waitFor(() =>
        http
          .expectOne('/api/donors/auth/refresh')
          .flush(problem('auth/invalid-refresh-token'), { status, statusText: 'Refused' }),
      );

      await vi.waitFor(() => expect(store.signedIn()).toBe(false));
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    });
  });

  describe.each([0, 408, 429, 500, 502, 503, 504])(
    'when the refresh fails with status %i',
    (status) => {
      it('then the session and its hint are kept for the next try', async () => {
        signInFirst();
        let failure: unknown;
        store.refresh().subscribe({ error: (reason: unknown) => (failure = reason) });
        await vi.waitFor(() =>
          http.expectOne('/api/donors/auth/refresh').flush(null, { status, statusText: 'Failed' }),
        );

        await vi.waitFor(() => expect(failure).toBeDefined());
        expect(store.signedIn()).toBe(true);
        expect(store.currentAccessToken()).toBe('token-1');
        expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
      });
    },
  );

  it('when a restore times out, then a restore right after does not wait again, and one after the pause tries again', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    vi.useFakeTimers();

    const first = store.restore();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('/api/donors/auth/refresh');
    await vi.advanceTimersByTimeAsync(REFRESH_REQUEST_TIMEOUT_MS);
    await first;

    await store.restore();
    http.expectNone('/api/donors/auth/refresh');
    expect(store.status()).toBe('anonymous');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');

    await vi.advanceTimersByTimeAsync(SLOW_RESTORE_PAUSE_MS);
    const third = store.restore();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-11'));
    await third;
    expect(store.currentAccessToken()).toBe('token-11');
  });

  it('when the donor signs out, then the sign-out waits for the refresh lock and the other tabs are told', async () => {
    signInFirst();
    const release = locks.holdForAnotherTab();
    let done = false;

    store.logout().subscribe(() => (done = true));
    await vi.waitFor(() => expect(locks.waitingCount).toBe(1));
    http.expectNone('/api/donors/auth/logout');

    release();
    await vi.waitFor(() =>
      http
        .expectOne('/api/donors/auth/logout')
        .flush(null, { status: 204, statusText: 'No Content' }),
    );
    await vi.waitFor(() => expect(done).toBe(true));
    expect(store.signedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    expect(channel.posted).toEqual([signedOut()]);
    await vi.waitFor(() => expect(locks.isHeld).toBe(false));
  });

  it('when another tab keeps the lock too long, then the sign-out is sent anyway', async () => {
    signInFirst();
    locks.holdForAnotherTab();
    vi.useFakeTimers();
    let done = false;
    store.logout().subscribe(() => (done = true));

    await vi.advanceTimersByTimeAsync(REFRESH_LOCK_WAIT_MS);

    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(store.signedIn()).toBe(false);
    expect(channel.posted).toEqual([signedOut()]);
  });

  it('when the sign-out gets no answer in time, then the request is aborted, the lock released and the session forgotten in every tab', async () => {
    signInFirst();
    vi.useFakeTimers();
    let done = false;
    store.logout().subscribe(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    const request = http.expectOne('/api/donors/auth/logout');

    await vi.advanceTimersByTimeAsync(REFRESH_REQUEST_TIMEOUT_MS);

    expect(request.cancelled).toBe(true);
    expect(done).toBe(true);
    expect(locks.isHeld).toBe(false);
    expect(store.signedIn()).toBe(false);
    expect(channel.posted).toEqual([signedOut()]);
  });

  it('when another tab signs out, then this tab forgets the session and its hint', () => {
    signInFirst();

    channel.deliverFromAnotherTab(signedOut());

    expect(store.status()).toBe('anonymous');
    expect(store.currentAccessToken()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('when another tab signs out, then the administration of this tab locks, and a session another tab announces later leaves it locked', () => {
    const access = TestBed.inject(AdministrationAccess);
    signInFirst();
    expect(access.unlocked()).toBe(true);

    channel.deliverFromAnotherTab(signedOut());
    expect(access.unlocked()).toBe(false);
    channel.deliverFromAnotherTab(sessionRefreshed(authResponse('token-12')));

    expect(access.unlocked()).toBe(false);
  });

  it('when another tab announces the session of another donor, then this tab keeps its own', () => {
    signInFirst();

    channel.deliverFromAnotherTab(
      sessionRefreshed(authResponse('token-12', sampleDonor({ id: 'another-donor' }))),
    );

    expect(store.currentAccessToken()).toBe('token-1');
    expect(store.donor()?.id).toBe(sampleDonor().id);
  });

  it('when the store goes away, then it closes its session channel', () => {
    TestBed.resetTestingModule();

    expect(channel.closed).toBe(true);
  });

  function signInFirst(): void {
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
    channel.posted.length = 0;
  }
});
