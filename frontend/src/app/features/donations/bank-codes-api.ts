import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface BankCodeItem {
  code: string;
  name: string;
}

export interface BankCodesResponse {
  fetchedAt: string | null;
  items: BankCodeItem[];
}

const BANK_CODES_URL = '/api/donations/bank-codes';

@Injectable({ providedIn: 'root' })
export class BankCodesApi {
  private readonly http = inject(HttpClient);

  list(): Observable<BankCodesResponse> {
    return this.http.get<BankCodesResponse>(BANK_CODES_URL);
  }
}
