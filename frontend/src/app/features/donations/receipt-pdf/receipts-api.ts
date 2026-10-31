import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { IssuedReceipt, ReceiptSubject } from './frozen-receipt';

export interface ReceiptImageBytes {
  readonly bytes: ArrayBuffer;
  readonly mediaType: string;
}

@Injectable({ providedIn: 'root' })
export class ReceiptsApi {
  private readonly http = inject(HttpClient);

  issue(subject: ReceiptSubject): Observable<IssuedReceipt> {
    return this.http.post<IssuedReceipt>('/api/donations/me/receipts', subject);
  }

  image(sha256: string): Observable<ReceiptImageBytes> {
    return this.http
      .get(`/api/donations/me/receipt-images/${encodeURIComponent(sha256)}`, {
        responseType: 'arraybuffer',
        observe: 'response',
      })
      .pipe(
        map((response) => ({
          bytes: response.body ?? new ArrayBuffer(0),
          mediaType: (response.headers.get('Content-Type') ?? '').split(';')[0].trim(),
        })),
      );
  }
}
