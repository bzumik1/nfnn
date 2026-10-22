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

export type PairingFilter = 'unpaired' | 'paired';

export type PairingMethod = 'VARIABLE_SYMBOL' | 'SENDER_ACCOUNT' | 'CONFIRMED_SYMBOL' | 'MANUAL';

export interface PairedDonationResponse {
  id: string;
  donorId: string;
  donorName: string | null;
  pairedBy: PairingMethod;
  status: 'RECEIVED' | 'REFUNDED';
  recordedAt: string;
  receiptIssued: boolean;
}

export interface AdminPaymentResponse {
  id: string;
  bankTransactionId: number;
  bookedOn: string;
  amountMinor: number;
  currency: string;
  variableSymbol: string | null;
  counterpartyAccount: string | null;
  counterpartyName: string | null;
  messageForRecipient: string | null;
  importedAt: string;
  unpairedByAdminAt: string | null;
  donation: PairedDonationResponse | null;
}

export interface AdminPaymentListResponse {
  year: number | null;
  availableYears: number[];
  items: AdminPaymentResponse[];
}

export interface AdminDonorResponse {
  donorId: string;
  name: string;
  type: 'PERSON' | 'COMPANY';
  variableSymbol: string;
  companyIdentifier: string | null;
}

export interface AdminDonorSearchResponse {
  items: AdminDonorResponse[];
}

export interface PairPaymentResponse {
  donationId: string;
  changedYearlyReceipts: number[];
}

export interface UnpairPaymentResponse {
  changedYearlyReceipts: number[];
}

export interface AdministratorResponse {
  donorId: string;
  name: string;
  email: string;
  secondFactorEnabled: boolean;
}

export interface AdministratorListResponse {
  items: AdministratorResponse[];
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  importState(): Observable<ImportStateResponse> {
    return this.http.get<ImportStateResponse>('/api/admin/donations/import-state');
  }

  payments(
    pairing: PairingFilter,
    year: number | null = null,
  ): Observable<AdminPaymentListResponse> {
    const params: Record<string, string> = { pairing };
    if (year !== null) {
      params['year'] = String(year);
    }
    return this.http.get<AdminPaymentListResponse>('/api/admin/donations/payments', { params });
  }

  searchDonors(query: string): Observable<AdminDonorSearchResponse> {
    return this.http.get<AdminDonorSearchResponse>('/api/admin/donations/donors', {
      params: { query },
    });
  }

  pairPayment(paymentId: string, donorId: string): Observable<PairPaymentResponse> {
    return this.http.post<PairPaymentResponse>(
      `/api/admin/donations/payments/${encodeURIComponent(paymentId)}/pair`,
      { donorId },
    );
  }

  unpairPayment(paymentId: string): Observable<UnpairPaymentResponse> {
    return this.http.post<UnpairPaymentResponse>(
      `/api/admin/donations/payments/${encodeURIComponent(paymentId)}/unpair`,
      null,
    );
  }

  administrators(): Observable<AdministratorListResponse> {
    return this.http.get<AdministratorListResponse>('/api/admin/donors/administrators');
  }

  grantAdministration(email: string): Observable<AdministratorResponse> {
    return this.http.post<AdministratorResponse>('/api/admin/donors/administrators', { email });
  }

  revokeAdministration(donorId: string): Observable<void> {
    return this.http.delete<void>(
      `/api/admin/donors/administrators/${encodeURIComponent(donorId)}`,
    );
  }

  resetSecondFactor(donorId: string): Observable<void> {
    return this.http.post<void>(
      `/api/admin/donors/${encodeURIComponent(donorId)}/second-factor/reset`,
      null,
    );
  }
}
