import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  defer,
  finalize,
  firstValueFrom,
  from,
  map,
  Observable,
  of,
  share,
  switchMap,
  tap,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';
import { AuthApi } from './auth-api';
import { PasskeyAuthenticator } from './passkey-authenticator';
import { deviceAccountOf, SESSION_DEVICE, type SignInSecret } from './session-device';
import {
  isSessionRefreshed,
  isSignedOut,
  REFRESH_LOCK_NAME,
  REFRESH_LOCK_WAIT_MS,
  REFRESH_REQUEST_TIMEOUT_MS,
  SESSION_CHANNEL,
  sessionRefreshed,
  SignedOut,
  SessionRefreshed,
  signedOut,
  SLOW_RESTORE_PAUSE_MS,
  TAB_LOCKS,
} from './session-tabs';
import {
  AuthResponse,
  ChangePasswordRequest,
  Confirmation,
  Donor,
  EmailChangeRequest,
  RegisterDonorRequest,
  SecondFactorDisableRequest,
  SecondFactorEnrolment,
  UpdateDonorProfileRequest,
} from './donor';

export type AuthStatus = 'unknown' | 'anonymous' | 'signed-in';

export const SESSION_HINT_KEY = 'nfnn.donor-session';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly passkeys = inject(PasskeyAuthenticator);
  private readonly locks = inject(TAB_LOCKS);
  private readonly channel = inject(SESSION_CHANNEL)();
  private readonly device = inject(SESSION_DEVICE);
  private readonly currentDonor = signal<Donor | null>(null);
  private readonly currentStatus = signal<AuthStatus>('unknown');
  private accessToken: string | null = null;
  private refreshInFlight: Observable<string> | null = null;
  private restoring: Promise<void> | null = null;
  private adoptions = 0;

  readonly donor = this.currentDonor.asReadonly();
  readonly status = this.currentStatus.asReadonly();
  readonly signedIn = computed(() => this.currentDonor() !== null);
  readonly isAdmin = computed(() => this.currentDonor()?.roles.includes('ADMIN') ?? false);

  constructor() {
    this.channel?.addEventListener('message', (event) => {
      if (isSessionRefreshed(event.data)) {
        this.adoptAnnounced(event.data.response);
      } else if (isSignedOut(event.data)) {
        this.forget();
        this.device.signedOutElsewhere();
      }
    });
    inject(DestroyRef).onDestroy(() => this.channel?.close());
  }

  currentAccessToken(): string | null {
    return this.accessToken;
  }

  register(request: RegisterDonorRequest): Observable<void> {
    return this.api.register(request);
  }

  confirmEmail(token: string): Observable<Donor> {
    return this.api
      .confirmEmailVerification(token)
      .pipe(map((response) => this.adoptSignIn(response, { kind: 'none' })));
  }

  login(email: string, password: string): Observable<Donor> {
    return this.api
      .login(email, password)
      .pipe(map((response) => this.adoptSignIn(response, { kind: 'password', password })));
  }

  completeSecondFactor(challenge: string, code: string, password?: string): Observable<Donor> {
    return this.api
      .completeSecondFactor(challenge, code)
      .pipe(
        map((response) =>
          this.adoptSignIn(
            response,
            password === undefined ? { kind: 'none' } : { kind: 'password', password },
          ),
        ),
      );
  }

  signInWithPasskey(): Observable<Donor> {
    return this.api.passkeySignInOptions().pipe(
      switchMap((options) =>
        from(this.device.prfInput()).pipe(
          switchMap((input) => from(this.passkeys.getWithPrf(options, input))),
          switchMap(({ credential, prf }) => {
            let handedOver = false;
            return this.api.signInWithPasskey(options.challenge, credential).pipe(
              map((response) => {
                handedOver = prf !== null;
                return this.adoptSignIn(
                  response,
                  prf === null ? { kind: 'none' } : { kind: 'prf', reading: prf },
                );
              }),
              finalize(() => {
                if (!handedOver) {
                  prf?.output.fill(0);
                }
              }),
            );
          }),
        ),
      ),
    );
  }

  refresh(): Observable<string> {
    if (this.refreshInFlight === null) {
      const seen = this.adoptions;
      this.refreshInFlight = this.underRefreshLock(() =>
        defer(() =>
          this.adoptions !== seen && this.accessToken !== null
            ? of(this.accessToken)
            : this.requestRefresh(),
        ),
      ).pipe(
        catchError((failure: unknown) => {
          if (isRefusal(failure)) {
            this.endRefused();
          }
          return throwError(() => failure);
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        share({ resetOnRefCountZero: false }),
      );
    }
    return this.refreshInFlight;
  }

  restore(): Promise<void> {
    if (this.restoring === null) {
      this.restoring = hasSessionHint()
        ? firstValueFrom(this.refresh()).then(
            () => undefined,
            (failure: unknown) => this.restoreLater(failure),
          )
        : Promise.resolve(this.forgetWithoutSession());
    }
    return this.restoring;
  }

  logout(): Observable<void> {
    const signOut = () =>
      this.api.logout().pipe(
        timeout(REFRESH_REQUEST_TIMEOUT_MS),
        catchError(() => of(undefined)),
      );
    const donor = this.currentDonor();
    return this.underRefreshLock(signOut).pipe(
      catchError(() => signOut()),
      tap(() => {
        this.forget();
        this.announce(signedOut());
        if (donor !== null) {
          void this.device.signedOut(deviceAccountOf(donor));
        }
      }),
      map(() => undefined),
    );
  }

  updateProfile(request: UpdateDonorProfileRequest): Observable<Donor> {
    return this.api.updateProfile(request).pipe(tap((donor) => this.currentDonor.set(donor)));
  }

  changePassword(request: ChangePasswordRequest): Observable<Donor> {
    return this.api.changePassword(request).pipe(
      map((response) => {
        const donor = this.adopt(response);
        void this.device.passwordChanged(deviceAccountOf(donor), request.newPassword);
        return donor;
      }),
    );
  }

  requestEmailChange(request: EmailChangeRequest): Observable<void> {
    return this.api.requestEmailChange(request).pipe(switchMap(() => this.reloadProfile()));
  }

  resendEmailChange(): Observable<void> {
    return this.api.resendEmailChange().pipe(switchMap(() => this.reloadProfile()));
  }

  cancelEmailChange(): Observable<void> {
    return this.api.cancelEmailChange().pipe(switchMap(() => this.reloadProfile()));
  }

  hasPasskeys(): Observable<boolean> {
    return this.api.passkeys().pipe(
      map((list) => list.items.length > 0),
      catchError(() => of(false)),
    );
  }

  confirmWith(password: string | null): Observable<Confirmation> {
    if (password !== null) {
      return of({ password });
    }
    return this.api
      .passkeySignInOptions()
      .pipe(
        switchMap((options) =>
          from(this.passkeys.get(options)).pipe(
            map((credential) => ({ passkey: { challenge: options.challenge, credential } })),
          ),
        ),
      );
  }

  setupSecondFactor(confirmation: Confirmation): Observable<SecondFactorEnrolment> {
    return this.api.setupSecondFactor(confirmation);
  }

  removePassword(confirmation: Confirmation): Observable<Donor> {
    return this.api.removePassword(confirmation).pipe(
      map((response) => {
        const donor = this.adopt(response);
        void this.device.passwordRemoved(deviceAccountOf(donor));
        return donor;
      }),
    );
  }

  confirmSecondFactor(code: string): Observable<Donor> {
    return this.api.confirmSecondFactor(code).pipe(map((response) => this.adopt(response)));
  }

  disableSecondFactor(request: SecondFactorDisableRequest): Observable<Donor> {
    return this.api.disableSecondFactor(request).pipe(map((response) => this.adopt(response)));
  }

  private requestRefresh(): Observable<string> {
    return this.api.refresh().pipe(
      timeout(REFRESH_REQUEST_TIMEOUT_MS),
      map((response) => {
        this.adoptRestored(response);
        this.announce(sessionRefreshed(response));
        return response.accessToken;
      }),
    );
  }

  private underRefreshLock<T>(work: () => Observable<T>): Observable<T> {
    const locks = this.locks;
    if (locks === null) {
      return work();
    }
    return new Observable<T>((subscriber) => {
      const waiting = new AbortController();
      const giveUp = setTimeout(() => waiting.abort(), REFRESH_LOCK_WAIT_MS);
      locks
        .request(
          REFRESH_LOCK_NAME,
          { signal: waiting.signal },
          () =>
            new Promise<void>((release) => {
              clearTimeout(giveUp);
              if (subscriber.closed) {
                release();
                return;
              }
              subscriber.add(
                work()
                  .pipe(finalize(release))
                  .subscribe({
                    next: (value) => subscriber.next(value),
                    error: (failure: unknown) => subscriber.error(failure),
                    complete: () => subscriber.complete(),
                  }),
              );
            }),
        )
        .catch((failure: unknown) => {
          clearTimeout(giveUp);
          subscriber.error(failure);
        });
      return () => {
        clearTimeout(giveUp);
        waiting.abort();
      };
    });
  }

  private restoreLater(failure: unknown): void {
    if (isRefusal(failure)) {
      return;
    }
    if (this.currentStatus() === 'unknown') {
      this.currentStatus.set('anonymous');
    }
    if (isSlow(failure)) {
      setTimeout(() => (this.restoring = null), SLOW_RESTORE_PAUSE_MS);
    } else {
      this.restoring = null;
    }
  }

  private announce(message: SessionRefreshed | SignedOut): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      return;
    }
  }

  private adoptAnnounced(response: AuthResponse): void {
    const current = this.currentDonor();
    if (current !== null && current.id !== response.user.id) {
      return;
    }
    this.adoptRestored(response);
  }

  private adoptRestored(response: AuthResponse): Donor {
    const before = this.currentDonor();
    const donor = this.adopt(response);
    if (before === null || before.id !== donor.id) {
      void this.device.restored(deviceAccountOf(donor));
    }
    return donor;
  }

  private adoptSignIn(response: AuthResponse, secret: SignInSecret): Donor {
    const donor = this.adopt(response);
    void this.device.signedIn(deviceAccountOf(donor), secret);
    return donor;
  }

  private endRefused(): void {
    const donor = this.currentDonor();
    this.forget();
    void (donor === null
      ? this.device.sessionLost()
      : this.device.signedOut(deviceAccountOf(donor)));
  }

  private reloadProfile(): Observable<void> {
    return this.api.profile().pipe(
      tap((donor) => this.currentDonor.set(donor)),
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  private adopt(response: AuthResponse): Donor {
    this.adoptions++;
    this.accessToken = response.accessToken;
    this.currentDonor.set(response.user);
    this.currentStatus.set('signed-in');
    rememberSession(true);
    return response.user;
  }

  private forgetWithoutSession(): void {
    this.forget();
    void this.device.sessionLost();
  }

  private forget(): void {
    this.accessToken = null;
    this.currentDonor.set(null);
    this.currentStatus.set('anonymous');
    rememberSession(false);
  }
}

function isRefusal(failure: unknown): boolean {
  return (
    failure instanceof HttpErrorResponse &&
    failure.status >= 400 &&
    failure.status < 500 &&
    failure.status !== 408 &&
    failure.status !== 429
  );
}

function isSlow(failure: unknown): boolean {
  return (
    failure instanceof TimeoutError ||
    (failure instanceof DOMException && failure.name === 'AbortError')
  );
}

function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSession(present: boolean): void {
  try {
    if (present) {
      localStorage.setItem(SESSION_HINT_KEY, '1');
    } else {
      localStorage.removeItem(SESSION_HINT_KEY);
    }
  } catch {
    return;
  }
}
