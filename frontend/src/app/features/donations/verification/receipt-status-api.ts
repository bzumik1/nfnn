import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { WITHOUT_ACCESS_TOKEN } from '../../../core/auth/auth-interceptor';

export type ReceiptStatus = 'active' | 'replaced' | 'withdrawn' | 'unknown';

export interface ReceiptStatusResponse {
  readonly status: ReceiptStatus;
}

@Injectable({ providedIn: 'root' })
export class ReceiptStatusApi {
  private readonly http = inject(HttpClient);

  status(digest: string): Observable<ReceiptStatusResponse> {
    return this.http.post<ReceiptStatusResponse>(
      '/api/donations/receipts/status',
      { digest },
      { context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true) },
    );
  }
}
