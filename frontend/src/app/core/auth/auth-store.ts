import { computed, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
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
} from 'rxjs';
import { AuthApi } from './auth-api';
import { PasskeyAuthenticator } from './passkey-authenticator';
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
  private readonly currentDonor = signal<Donor | null>(null);
  private readonly currentStatus = signal<AuthStatus>('unknown');
  private accessToken: string | null = null;
  private refreshInFlight: Observable<string> | null = null;
  private restoring: Promise<void> | null = null;

  readonly donor = this.currentDonor.asReadonly();
  readonly status = this.currentStatus.asReadonly();
  readonly signedIn = computed(() => this.currentDonor() !== null);
  readonly isAdmin = computed(() => this.currentDonor()?.roles.includes('ADMIN') ?? false);

  currentAccessToken(): string | null {
    return this.accessToken;
  }

  register(request: RegisterDonorRequest): Observable<void> {
    return this.api.register(request);
  }

  confirmEmail(token: string): Observable<Donor> {
    return this.api.confirmEmailVerification(token).pipe(map((response) => this.adopt(response)));
  }

  login(email: string, password: string): Observable<Donor> {
    return this.api.login(email, password).pipe(map((response) => this.adopt(response)));
  }

  completeSecondFactor(challenge: string, code: string): Observable<Donor> {
    return this.api
      .completeSecondFactor(challenge, code)
      .pipe(map((response) => this.adopt(response)));
  }

  signInWithPasskey(): Observable<Donor> {
    return this.api.passkeySignInOptions().pipe(
      switchMap((options) =>
        from(this.passkeys.get(options)).pipe(
          switchMap((credential) => this.api.signInWithPasskey(options.challenge, credential)),
        ),
      ),
      map((response) => this.adopt(response)),
    );
  }

  refresh(): Observable<string> {
    if (this.refreshInFlight === null) {
      this.refreshInFlight = this.api.refresh().pipe(
        map((response) => this.adopt(response)),
        map(() => this.accessToken as string),
        catchError((failure: unknown) => {
          this.forget();
          return throwError(() => failure);
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        share(),
      );
    }
    return this.refreshInFlight;
  }

  restore(): Promise<void> {
    if (this.restoring === null) {
      this.restoring = hasSessionHint()
        ? firstValueFrom(this.refresh()).then(
            () => undefined,
            () => undefined,
          )
        : Promise.resolve(this.forget());
    }
    return this.restoring;
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(
      catchError(() => of(undefined)),
      tap(() => this.forget()),
      map(() => undefined),
    );
  }

  updateProfile(request: UpdateDonorProfileRequest): Observable<Donor> {
    return this.api.updateProfile(request).pipe(tap((donor) => this.currentDonor.set(donor)));
  }

  changePassword(request: ChangePasswordRequest): Observable<Donor> {
    return this.api.changePassword(request).pipe(map((response) => this.adopt(response)));
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
    return this.api.removePassword(confirmation).pipe(map((response) => this.adopt(response)));
  }

  confirmSecondFactor(code: string): Observable<Donor> {
    return this.api.confirmSecondFactor(code).pipe(map((response) => this.adopt(response)));
  }

  disableSecondFactor(request: SecondFactorDisableRequest): Observable<Donor> {
    return this.api.disableSecondFactor(request).pipe(map((response) => this.adopt(response)));
  }

  private reloadProfile(): Observable<void> {
    return this.api.profile().pipe(
      tap((donor) => this.currentDonor.set(donor)),
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  private adopt(response: AuthResponse): Donor {
    this.accessToken = response.accessToken;
    this.currentDonor.set(response.user);
    this.currentStatus.set('signed-in');
    rememberSession(true);
    return response.user;
  }

  private forget(): void {
    this.accessToken = null;
    this.currentDonor.set(null);
    this.currentStatus.set('anonymous');
    rememberSession(false);
  }
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
