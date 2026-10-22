import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface BankAccountResponse {
  accountNumber: string;
  iban: string;
  recipientName: string;
}

export type PaymentQrPurpose = 'DONATION' | 'ACCOUNT_VERIFICATION';

export interface PaymentQrResponse {
  spayd: string;
  qrPngBase64: string;
  bankAccount: BankAccountResponse;
}

@Injectable({ providedIn: 'root' })
export class PaymentQrApi {
  private readonly http = inject(HttpClient);

  paymentQr(
    amount: number,
    variableSymbol: string | null,
    purpose: PaymentQrPurpose = 'DONATION',
  ): Observable<PaymentQrResponse> {
    let params = new HttpParams().set('amount', amount);
    if (variableSymbol) {
      params = params.set('variableSymbol', variableSymbol);
    }
    if (purpose !== 'DONATION') {
      params = params.set('purpose', purpose);
    }
    return this.http.get<PaymentQrResponse>('/api/donations/payment-qr', { params });
  }
}
