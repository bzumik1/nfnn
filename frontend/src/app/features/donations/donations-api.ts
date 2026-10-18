import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type DonationStatus = 'RECEIVED' | 'REFUNDED';

export type DonationSource = 'BANK_TRANSFER' | 'MANUAL';

export interface DonationItem {
  id: string;
  receiptNumber: string | null;
  receivedAt: string;
  amountMinor: number;
  currency: string;
  purpose: string;
  status: DonationStatus;
  source: DonationSource;
}

export interface DonationListResponse {
  items: DonationItem[];
  totalAmountMinor: number;
  currency: string;
  count: number;
}

export interface YearTotal {
  year: number;
  count: number;
  totalAmountMinor: number;
}

export interface DonationSummaryResponse {
  totalAmountMinor: number;
  currency: string;
  count: number;
  lastReceivedAt: string | null;
  byYear: YearTotal[];
}

@Injectable({ providedIn: 'root' })
export class DonationsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<DonationListResponse> {
    return this.http.get<DonationListResponse>('/api/donations/me');
  }

  summary(): Observable<DonationSummaryResponse> {
    return this.http.get<DonationSummaryResponse>('/api/donations/me/summary');
  }
}
