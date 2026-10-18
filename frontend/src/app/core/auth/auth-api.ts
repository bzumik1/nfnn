import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthResponse, Donor, RegisterDonorRequest, UpdateDonorProfileRequest } from './donor';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  register(request: RegisterDonorRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/register', request);
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/donors/auth/login', { email, password });
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
}
