import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { QrMatrix } from '../../shared/ui/qr-code/qr-matrix';

export interface BankAccountResponse {
  accountNumber: string;
  iban: string;
  recipientName: string;
}

export type PaymentQrPurpose = 'DONATION' | 'ACCOUNT_VERIFICATION';

export interface PaymentQrResponse {
  spayd: string;
  qrCode: QrMatrix;
  bankAccount: BankAccountResponse;
}

@Injectable({ providedIn: 'root' })
export class PaymentQrApi {
  private readonly http = inject(HttpClient);
  private readonly knownAccount = signal<BankAccountResponse | null>(null);

  readonly foundationAccount = this.knownAccount.asReadonly();

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
    return this.http
      .get<PaymentQrResponse>('/api/donations/payment-qr', { params })
      .pipe(tap((qr) => this.knownAccount.set(qr.bankAccount)));
  }
}
