import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface BankAccountResponse {
  accountNumber: string;
  iban: string;
  recipientName: string;
}

export interface PaymentQrResponse {
  spayd: string;
  qrPngBase64: string;
  bankAccount: BankAccountResponse;
}

@Injectable({ providedIn: 'root' })
export class PaymentQrApi {
  private readonly http = inject(HttpClient);

  paymentQr(amount: number, variableSymbol: string | null): Observable<PaymentQrResponse> {
    let params = new HttpParams().set('amount', amount);
    if (variableSymbol) {
      params = params.set('variableSymbol', variableSymbol);
    }
    return this.http.get<PaymentQrResponse>('/api/donations/payment-qr', { params });
  }
}
