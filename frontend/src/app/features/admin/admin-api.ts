import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type ImportFailureKind =
  | 'RATE_LIMITED'
  | 'HISTORY_LOCKED'
  | 'UNAUTHORIZED'
  | 'TRANSPORT'
  | 'INVALID_RESPONSE'
  | 'UNEXPECTED';

export interface ImportFailure {
  kind: ImportFailureKind;
  message: string | null;
  attemptedAt: string | null;
}

export interface ImportStateResponse {
  coveredFrom: string | null;
  coveredTo: string | null;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  lastFailure: ImportFailure | null;
  consecutiveFailures: number;
  reportedOutage: ImportFailureKind | null;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  importState(): Observable<ImportStateResponse> {
    return this.http.get<ImportStateResponse>('/api/admin/donations/import-state');
  }
}
