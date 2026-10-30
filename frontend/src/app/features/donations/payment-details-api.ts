import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
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

  details({ pastBrowserCache = false } = {}): Observable<PaymentDetails> {
    return this.http
      .get<unknown>('/api/donations/payment-details', {
        context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true),
        cache: pastBrowserCache ? 'no-cache' : 'default',
      })
      .pipe(map(paymentDetailsOf));
  }
}

function paymentDetailsOf(answer: unknown): PaymentDetails {
  if (!isPaymentDetails(answer)) {
    throw new Error('The payment details answer does not have the shape of payment details');
  }
  return answer;
}

function isPaymentDetails(answer: unknown): answer is PaymentDetails {
  const details = answer as Partial<PaymentDetails> | null;
  return (
    typeof details === 'object' &&
    details !== null &&
    texts(details.account, ['number', 'iban', 'recipientName']) &&
    typeof details.currency === 'string' &&
    texts(details.messages, ['donation', 'accountVerification']) &&
    Number.isSafeInteger(details.accountVerificationAmountMinor)
  );
}

function texts(value: unknown, keys: readonly string[]): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    keys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string')
  );
}
