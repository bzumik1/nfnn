import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type BankAccountStatus = 'ACTIVE' | 'AWAITING_PAYMENT' | 'DISCONNECTED';

export interface BankAccountItem {
  id: string;
  accountNumber: string;
  status: BankAccountStatus;
  verifiedOn: string | null;
  connectedFrom: string | null;
  disconnectedOn: string | null;
  donationCount: number;
  totalAmountMinor: number;
  currency: string;
  lastDonationOn: string | null;
  shared: boolean;
  pairingExcluded: boolean;
}

export interface BankAccountListResponse {
  items: BankAccountItem[];
}

const BANK_ACCOUNTS_URL = '/api/donations/me/bank-accounts';

@Injectable({ providedIn: 'root' })
export class BankAccountsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<BankAccountListResponse> {
    return this.http.get<BankAccountListResponse>(BANK_ACCOUNTS_URL);
  }

  disconnect(id: string): Observable<void> {
    return this.http.post<void>(`${BANK_ACCOUNTS_URL}/${encodeURIComponent(id)}/disconnect`, null);
  }

  reconnect(id: string): Observable<void> {
    return this.http.post<void>(`${BANK_ACCOUNTS_URL}/${encodeURIComponent(id)}/reconnect`, null);
  }
}
