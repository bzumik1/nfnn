import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError, timeout } from 'rxjs';
import { WITHOUT_ACCESS_TOKEN } from '../../core/auth/auth-interceptor';
import { accountMatchesIban } from './czech-account';

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

export interface WrittenPaymentDetails {
  readonly details: PaymentDetails;
  readonly writtenAt: number | null;
}

export const PAYMENT_DETAILS_WAIT_MS = 5_000;

const PAYMENT_DETAILS = '/api/donations/payment-details';
const PAST_BROWSER_CACHE = new HttpHeaders({ 'Cache-Control': 'no-cache' });
const NO_HEADERS = new HttpHeaders();

@Injectable({ providedIn: 'root' })
export class PaymentDetailsApi {
  private readonly http = inject(HttpClient);

  details({ pastBrowserCache = false } = {}): Observable<WrittenPaymentDetails> {
    return this.http
      .get<unknown>(PAYMENT_DETAILS, {
        context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true),
        headers: pastBrowserCache ? PAST_BROWSER_CACHE : NO_HEADERS,
        cache: pastBrowserCache ? 'no-cache' : 'default',
        observe: 'response',
      })
      .pipe(
        timeout({
          first: PAYMENT_DETAILS_WAIT_MS,
          with: () => throwError(() => new HttpErrorResponse({ status: 0, url: PAYMENT_DETAILS })),
        }),
        map((response) => {
          const written = Date.parse(response.headers.get('Date') ?? '');
          return {
            details: paymentDetailsOf(response.body),
            writtenAt: Number.isFinite(written) ? written : null,
          };
        }),
      );
  }
}

export function paymentDetailsOf(answer: unknown): PaymentDetails {
  if (!isPaymentDetails(answer)) {
    throw new Error('The payment details answer does not have the shape of payment details');
  }
  if (!accountMatchesIban(answer.account.number, answer.account.iban)) {
    throw new Error('The IBAN of the payment details is not the IBAN of their account number');
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
