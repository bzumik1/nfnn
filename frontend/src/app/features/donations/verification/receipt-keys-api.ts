import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { WITHOUT_ACCESS_TOKEN } from '../../../core/auth/auth-interceptor';
import type { ReceiptKeysResponse } from './receipt-keys';

@Injectable({ providedIn: 'root' })
export class ReceiptKeysApi {
  private readonly http = inject(HttpClient);

  list(): Observable<ReceiptKeysResponse> {
    return this.http.get<ReceiptKeysResponse>('/api/donations/receipt-keys', {
      headers: { 'Cache-Control': 'no-cache' },
      context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true),
    });
  }
}
