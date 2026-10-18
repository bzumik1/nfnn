import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, Observable, switchMap, take, timer } from 'rxjs';

export type DonationStatus = 'RECEIVED' | 'REFUNDED';

export type DonationSource = 'BANK_TRANSFER' | 'MANUAL';

export type DonationPairing = 'VARIABLE_SYMBOL' | 'SENDER_ACCOUNT';

export interface DonationItem {
  id: string;
  receiptNumber: string | null;
  receivedAt: string;
  amountMinor: number;
  currency: string;
  purpose: string;
  status: DonationStatus;
  source: DonationSource;
  pairedBy: DonationPairing | null;
  senderAccount: string | null;
}

export interface DonationListResponse {
  items: DonationItem[];
  totalAmountMinor: number;
  currency: string;
  count: number;
}

export interface YearTotal {
  year: number;
  count: number;
  totalAmountMinor: number;
}

export interface DonationSummaryResponse {
  totalAmountMinor: number;
  currency: string;
  count: number;
  lastReceivedAt: string | null;
  byYear: YearTotal[];
  yearlyReceiptsAvailableThrough: number;
}

export interface BankCheckResponse {
  bankDataAsOf: string | null;
  checking: boolean;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

const EXTENDED_FILE_NAME = /(?:^|;)\s*filename\*\s*=\s*utf-8''([^;\s]+)/i;
const PLAIN_FILE_NAME = /(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i;

const BANK_CHECK_POLL_MS = 2000;
const BANK_CHECK_MAX_POLLS = 45;

@Injectable({ providedIn: 'root' })
export class DonationsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<DonationListResponse> {
    return this.http.get<DonationListResponse>('/api/donations/me');
  }

  summary(): Observable<DonationSummaryResponse> {
    return this.http.get<DonationSummaryResponse>('/api/donations/me/summary');
  }

  requestBankCheck(): Observable<BankCheckResponse> {
    return this.http.post<BankCheckResponse>('/api/donations/me/bank-check', null);
  }

  bankCheck(): Observable<BankCheckResponse> {
    return this.http.get<BankCheckResponse>('/api/donations/me/bank-check');
  }

  checkBankUntilDone(): Observable<BankCheckResponse> {
    return this.requestBankCheck().pipe(
      expand((check) => (check.checking ? timer(BANK_CHECK_POLL_MS).pipe(switchMap(() => this.bankCheck())) : EMPTY)),
      take(BANK_CHECK_MAX_POLLS + 1),
    );
  }

  singleReceipt(id: string): Observable<DownloadedFile> {
    return this.download(`/api/donations/me/${encodeURIComponent(id)}/receipt`, new HttpParams(), 'potvrzeni-o-daru.pdf');
  }

  yearlyReceipt(year: number): Observable<DownloadedFile> {
    return this.download(
      '/api/donations/me/receipts/yearly',
      new HttpParams().set('year', year),
      `potvrzeni-o-darech-${year}.pdf`,
    );
  }

  private download(url: string, params: HttpParams, fallbackFileName: string): Observable<DownloadedFile> {
    return this.http
      .get(url, { params, responseType: 'blob', observe: 'response' })
      .pipe(map((response) => downloadedFile(response, fallbackFileName)));
  }
}

function downloadedFile(response: HttpResponse<Blob>, fallbackFileName: string): DownloadedFile {
  return {
    blob: response.body ?? new Blob([], { type: 'application/pdf' }),
    fileName: fileNameOf(response.headers.get('Content-Disposition')) ?? fallbackFileName,
  };
}

function fileNameOf(contentDisposition: string | null): string | null {
  if (contentDisposition === null) {
    return null;
  }
  const extended = EXTENDED_FILE_NAME.exec(contentDisposition)?.[1];
  const decoded = extended === undefined ? null : decodedOrNull(extended);
  if (decoded) {
    return decoded;
  }
  const plain = PLAIN_FILE_NAME.exec(contentDisposition);
  return plain?.[1] || plain?.[2] || null;
}

function decodedOrNull(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}
