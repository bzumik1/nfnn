import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, EMPTY, expand, Observable, race, switchMap, take, timer } from 'rxjs';
import { LiveUpdates } from '../../core/live/live-updates';
import type { SavedFile } from '../../core/files/file-download';

export type DonationStatus = 'RECEIVED' | 'REFUNDED';

export type DonationSource = 'BANK_TRANSFER' | 'MANUAL';

export type DonationPairing = 'VARIABLE_SYMBOL' | 'SENDER_ACCOUNT' | 'CONFIRMED_SYMBOL';

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
  confirmedSymbol: string | null;
  accountVerification: boolean;
  receiptAvailable: boolean;
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
  receiptsAvailableFrom: number;
}

export interface BankCheckResponse {
  bankDataAsOf: string | null;
  checking: boolean;
}

export type DownloadedFile = SavedFile;

const EXTENDED_FILE_NAME = /(?:^|;)\s*filename\*\s*=\s*utf-8''([^;\s]+)/i;
const PLAIN_FILE_NAME = /(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i;

const BANK_CHECK_POLL_MS = 2000;
const BANK_CHECK_LIVE_POLL_MS = 15_000;
const BANK_CHECK_BUDGET_MS = 90_000;

@Injectable({ providedIn: 'root' })
export class DonationsApi {
  private readonly http = inject(HttpClient);
  private readonly live = inject(LiveUpdates);

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
    return defer(() => {
      const giveUpAt = Date.now() + BANK_CHECK_BUDGET_MS;
      return this.requestBankCheck().pipe(
        expand((check) =>
          check.checking && Date.now() < giveUpAt
            ? this.importEnded().pipe(switchMap(() => this.bankCheck()))
            : EMPTY,
        ),
      );
    });
  }

  private importEnded(): Observable<unknown> {
    const fallback = this.live.connected() ? BANK_CHECK_LIVE_POLL_MS : BANK_CHECK_POLL_MS;
    return race(this.live.changes(['bank-import']), timer(fallback)).pipe(take(1));
  }
}

export function downloadedFile(
  response: HttpResponse<Blob>,
  fallbackFileName: string,
): DownloadedFile {
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
