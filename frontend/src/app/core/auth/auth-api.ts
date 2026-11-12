import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfirmationReturn } from './confirmation-return';
import { SESSION_HEADER, SESSION_JAR, SessionKind } from './session-jar';
import {
  AuthorizationRequest,
  AuthResponse,
  ChangePasswordRequest,
  ClientDescription,
  Confirmation,
  ConnectedAppList,
  SignedInDeviceList,
  Donor,
  RedirectResponse,
  EmailChangeRequest,
  PasskeyAssertionCredential,
  PasskeyCreationOptions,
  Passkey,
  PasskeyList,
  PasskeyRegistrationCredential,
  PasskeySignInOptions,
  RegisterDonorRequest,
  SecondFactorDisableRequest,
  SecondFactorEnrolment,
  SecondFactorRecovery,
  UpdateDonorProfileRequest,
} from './donor';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly jar = inject(SESSION_JAR);

  register(request: RegisterDonorRequest): Observable<void> {
    return this.http.post<void>('/api/donors/auth/register', request);
  }

  requestEmailVerification(
    email: string,
    returnTo: ConfirmationReturn | null = null,
  ): Observable<void> {
    return this.http.post<void>(
      '/api/donors/auth/email-verification/request',
      returnTo === null ? { email } : { email, returnTo },
    );
  }

  confirmEmailChange(token: string): Observable<void> {
    return this.http.post<void>('/api/donors/auth/email-change/confirm', { token });
  }

  confirmEmailVerification(token: string, session: SessionKind): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/email-verification/confirm', {
      token,
      session,
    });
  }

  login(email: string, password: string, session: SessionKind): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/login', { email, password, session });
  }

  completeSecondFactor(
    challenge: string,
    code: string,
    session: SessionKind,
  ): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/login/second-factor', {
      challenge,
      code,
      session,
    });
  }

  startSecondFactorRecovery(challenge: string): Observable<SecondFactorRecovery> {
    return this.http.post<SecondFactorRecovery>('/api/donors/auth/login/second-factor/recovery', {
      challenge,
    });
  }

  passkeySignInOptions(): Observable<PasskeySignInOptions> {
    return this.http.post<PasskeySignInOptions>('/api/donors/auth/passkey/options', null);
  }

  signInWithPasskey(
    challenge: string,
    credential: PasskeyAssertionCredential,
    session: SessionKind,
  ): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/passkey', {
      challenge,
      credential,
      session,
    });
  }

  refresh(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/refresh', null, {
      headers: this.sessionHeaders(),
    });
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/donors/auth/logout', null, {
      headers: this.sessionHeaders(),
    });
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>('/api/donors/auth/password-reset/request', { email });
  }

  confirmPasswordReset(token: string, password: string): Observable<void> {
    return this.http.post<void>('/api/donors/auth/password-reset/confirm', { token, password });
  }

  passkeyRecoveryOptions(token: string, code: string | null): Observable<PasskeyCreationOptions> {
    return this.http.post<PasskeyCreationOptions>(
      '/api/donors/auth/password-reset/passkey/options',
      code === null ? { token } : { token, code },
    );
  }

  recoverWithPasskey(
    token: string,
    challenge: string,
    name: string,
    credential: PasskeyRegistrationCredential,
  ): Observable<Passkey> {
    return this.http.post<Passkey>('/api/donors/auth/password-reset/passkey', {
      token,
      challenge,
      name,
      credential,
    });
  }

  profile(): Observable<Donor> {
    return this.http.get<Donor>('/api/donors/me');
  }

  updateProfile(request: UpdateDonorProfileRequest): Observable<Donor> {
    return this.http.patch<Donor>('/api/donors/me', request);
  }

  changePassword(request: ChangePasswordRequest): Observable<AuthResponse> {
    return this.http.put<AuthResponse>('/api/donors/me/password', request);
  }

  requestEmailChange(request: EmailChangeRequest): Observable<void> {
    return this.http.post<void>('/api/donors/me/email-change', request);
  }

  resendEmailChange(): Observable<void> {
    return this.http.post<void>('/api/donors/me/email-change/resend', {});
  }

  cancelEmailChange(): Observable<void> {
    return this.http.delete<void>('/api/donors/me/email-change');
  }

  setupSecondFactor(confirmation: Confirmation): Observable<SecondFactorEnrolment> {
    return this.http.post<SecondFactorEnrolment>(
      '/api/donors/me/second-factor/setup',
      confirmation,
    );
  }

  removePassword(confirmation: Confirmation): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/me/password/remove', confirmation);
  }

  confirmSecondFactor(code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/me/second-factor/confirm', { code });
  }

  disableSecondFactor(request: SecondFactorDisableRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/me/second-factor/disable', request);
  }

  passkeys(): Observable<PasskeyList> {
    return this.http.get<PasskeyList>('/api/donors/me/passkeys');
  }

  passkeyCreationOptions(confirmation: Confirmation): Observable<PasskeyCreationOptions> {
    return this.http.post<PasskeyCreationOptions>('/api/donors/me/passkeys/options', confirmation);
  }

  addPasskey(
    challenge: string,
    name: string,
    credential: PasskeyRegistrationCredential,
  ): Observable<Passkey> {
    return this.http.post<Passkey>('/api/donors/me/passkeys', { challenge, name, credential });
  }

  renamePasskey(id: string, name: string): Observable<Passkey> {
    return this.http.patch<Passkey>(`/api/donors/me/passkeys/${encodeURIComponent(id)}`, { name });
  }

  removePasskey(id: string): Observable<void> {
    return this.http.delete<void>(`/api/donors/me/passkeys/${encodeURIComponent(id)}`);
  }

  describeClient(clientId: string, redirectUri: string): Observable<ClientDescription> {
    return this.http.get<ClientDescription>('/api/donors/oauth/client', {
      params: { clientId, redirectUri },
    });
  }

  authorize(request: AuthorizationRequest): Observable<RedirectResponse> {
    return this.http.post<RedirectResponse>('/api/donors/oauth/authorize', request);
  }

  connections(): Observable<ConnectedAppList> {
    return this.http.get<ConnectedAppList>('/api/donors/me/connections');
  }

  disconnect(id: string): Observable<void> {
    return this.http.delete<void>(`/api/donors/me/connections/${id}`);
  }

  devices(): Observable<SignedInDeviceList> {
    return this.http.get<SignedInDeviceList>('/api/donors/me/devices');
  }

  signOutDevice(id: string): Observable<void> {
    return this.http.delete<void>(`/api/donors/me/devices/${id}`);
  }

  signOutOtherDevices(): Observable<void> {
    return this.http.delete<void>('/api/donors/me/devices');
  }

  private sessionHeaders(): HttpHeaders {
    return this.jar.installed ? new HttpHeaders({ [SESSION_HEADER]: 'APP' }) : new HttpHeaders();
  }
}
