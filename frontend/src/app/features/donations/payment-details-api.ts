import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { WITHOUT_ACCESS_TOKEN } from '../../core/auth/auth-interceptor';

export interface PaymentAccount {
  readonly number: string;
  readonly iban: string;
  readonly recipientName: string;
}

export interface PaymentDetails {
  readonly account: PaymentAccount;
  readonly currency: string;
  readonly messages: {
    readonly donation: string;
    readonly accountVerification: string;
  };
  readonly accountVerificationAmountMinor: number;
}

@Injectable({ providedIn: 'root' })
export class PaymentDetailsApi {
  private readonly http = inject(HttpClient);

  details(): Observable<PaymentDetails> {
    return this.http.get<PaymentDetails>('/api/donations/payment-details', {
      context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true),
    });
  }
}
