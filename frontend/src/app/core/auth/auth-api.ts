import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthorizationRequest,
  AuthResponse,
  ChangePasswordRequest,
  ClientDescription,
  ConnectedAppList,
  Donor,
  RedirectResponse,
  EmailChangeRequest,
  RegisterDonorRequest,
  SecondFactorDisableRequest,
  SecondFactorEnrolment,
  UpdateDonorProfileRequest,
} from './donor';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  register(request: RegisterDonorRequest): Observable<void> {
    return this.http.post<void>('/api/donors/auth/register', request);
  }

  requestEmailVerification(email: string): Observable<void> {
    return this.http.post<void>('/api/donors/auth/email-verification/request', { email });
  }

  confirmEmailVerification(token: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/email-verification/confirm', { token });
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/login', { email, password });
  }

  completeSecondFactor(challenge: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/login/second-factor', {
      challenge,
      code,
    });
  }

  refresh(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/refresh', null);
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/donors/auth/logout', null);
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>('/api/donors/auth/password-reset/request', { email });
  }

  confirmPasswordReset(token: string, password: string): Observable<void> {
    return this.http.post<void>('/api/donors/auth/password-reset/confirm', { token, password });
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

  setupSecondFactor(password: string): Observable<SecondFactorEnrolment> {
    return this.http.post<SecondFactorEnrolment>('/api/donors/me/second-factor/setup', {
      password,
    });
  }

  confirmSecondFactor(code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/me/second-factor/confirm', { code });
  }

  disableSecondFactor(request: SecondFactorDisableRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/me/second-factor/disable', request);
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
}
