import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { IssuedReceipt, ReceiptSubject } from './frozen-receipt';

export interface ReceiptImageBytes {
  readonly bytes: ArrayBuffer;
  readonly mediaType: string;
}

export interface ReceiptSource {
  receipt(): Observable<IssuedReceipt>;
  image(sha256: string): Observable<ReceiptImageBytes>;
}

const DONOR_IMAGES = '/api/donations/me/receipt-images';
const ADMINISTRATION_RECEIPTS = '/api/admin/donations/receipts';
const ADMINISTRATION_IMAGES = '/api/admin/donations/receipt-images';

@Injectable({ providedIn: 'root' })
export class ReceiptsApi {
  private readonly http = inject(HttpClient);

  issue(subject: ReceiptSubject): Observable<IssuedReceipt> {
    return this.http.post<IssuedReceipt>('/api/donations/me/receipts', subject);
  }

  image(sha256: string): Observable<ReceiptImageBytes> {
    return this.imageAt(DONOR_IMAGES, sha256);
  }

  donorSource(subject: ReceiptSubject): ReceiptSource {
    return {
      receipt: () => this.issue(subject),
      image: (sha256) => this.image(sha256),
    };
  }

  administrationSource(receiptId: string): ReceiptSource {
    return {
      receipt: () =>
        this.http.get<IssuedReceipt>(`${ADMINISTRATION_RECEIPTS}/${encodeURIComponent(receiptId)}`),
      image: (sha256) => this.imageAt(ADMINISTRATION_IMAGES, sha256),
    };
  }

  private imageAt(base: string, sha256: string): Observable<ReceiptImageBytes> {
    return this.http
      .get(`${base}/${encodeURIComponent(sha256)}`, {
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
