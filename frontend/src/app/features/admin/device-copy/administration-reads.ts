import { computed, inject, Injectable } from '@angular/core';
import { catchError, concat, defer, from, map, type Observable, of, switchMap } from 'rxjs';
import { Connectivity } from '../../../core/connectivity/connectivity';
import {
  AdminApi,
  type AdminDonorDetailResponse,
  type AdminDonorSearchResponse,
  type AdminPaymentListResponse,
  type DonorAccountListResponse,
  type DonorAccountResponse,
  type PairingFilter,
  type PaymentQuery,
} from '../admin-api';
import { AdministrationCopy } from './administration-copy';
import { AdministrationCopyDownload } from './administration-copy-download';
import {
  accountSearch,
  type CopyAccountRow,
  type CopyDonationRow,
  type CopyDonorRecordRow,
  type CopyLinkRow,
  type CopyPaymentRow,
  type CopyReceiptRow,
  type CopySymbolClaimRow,
  donorCard,
  donorRecordSearch,
  type DonationsCopyRows,
  paymentList,
} from './administration-views';

export const REFRESH_AFTER_MS = 60_000;

export type BankAccountsSource = 'server' | 'pending' | 'unavailable';

export interface DonorCardRead {
  readonly detail: AdminDonorDetailResponse;
  readonly bankAccounts: BankAccountsSource;
}

type Freshness = 'fresh' | 'kept' | 'outdated';

@Injectable({ providedIn: 'root' })
export class AdministrationReads {
  private readonly api = inject(AdminApi);
  private readonly copy = inject(AdministrationCopy);
  private readonly download = inject(AdministrationCopyDownload);
  private readonly connectivity = inject(Connectivity);
  private changedSince = true;
  private checkedAt = Number.NEGATIVE_INFINITY;

  private readonly payments = this.copy.rows<CopyPaymentRow>('donations', 'payments');
  private readonly donations = this.copy.rows<CopyDonationRow>('donations', 'donations');
  private readonly donorRecords = this.copy.rows<CopyDonorRecordRow>('donations', 'donor-records');
  private readonly links = this.copy.rows<CopyLinkRow>('donations', 'links');
  private readonly symbolClaims = this.copy.rows<CopySymbolClaimRow>('donations', 'symbol-claims');
  private readonly receipts = this.copy.rows<CopyReceiptRow>('donations', 'receipts');
  private readonly accounts = this.copy.rows<CopyAccountRow>('donors', 'accounts');

  readonly fromCopyOffline = computed(() => this.copy.opened() && this.connectivity.offline());
  readonly copyTime = computed(() => latest(this.download.checkedAt(), this.copy.storedAt()));

  changed(): void {
    this.changedSince = true;
  }

  paymentList(
    pairing: PairingFilter,
    query: PaymentQuery & { readonly year?: number } = {},
  ): Observable<AdminPaymentListResponse> {
    return this.read(
      () => {
        const rows = this.donationsRows();
        return rows === null ? null : paymentList(rows, pairing, query);
      },
      () => this.api.payments(pairing, query),
    );
  }

  donorSearch(query: string): Observable<AdminDonorSearchResponse> {
    return this.read(
      () => {
        const records = this.donorRecords();
        return records === null ? null : donorRecordSearch(records, query);
      },
      () => this.api.searchDonors(query),
    );
  }

  accountList(query: string, limit?: number): Observable<DonorAccountListResponse> {
    return this.read(
      () => {
        const accounts = this.accounts();
        return accounts === null ? null : accountSearch(accounts, query, 0, limit);
      },
      () => this.api.donors(query, limit),
    );
  }

  account(donorId: string): Observable<DonorAccountResponse> {
    return this.read(
      () => this.accounts()?.find((account) => account.donorId === donorId) ?? null,
      () => this.api.donor(donorId),
    );
  }

  donorCard(donorId: string): Observable<DonorCardRead> {
    return this.fromCopy(() => {
      const rows = this.donationsRows();
      const summary = this.copy.summary();
      if (rows === null || summary?.receiptsAvailableFrom === undefined) {
        return null;
      }
      return donorCard(rows, donorId, {
        today: summary.today,
        receiptsAvailableFrom: summary.receiptsAvailableFrom,
      });
    }).pipe(
      switchMap((card) => {
        const server = this.api.donorDonations(donorId);
        if (card === null) {
          return server.pipe(map((detail): DonorCardRead => ({ detail, bankAccounts: 'server' })));
        }
        const held = (bankAccounts: BankAccountsSource): DonorCardRead => ({
          detail: { ...card, bankAccounts: [] },
          bankAccounts,
        });
        if (this.connectivity.offline()) {
          return of(held('unavailable'));
        }
        return concat(
          of(held('pending')),
          server.pipe(
            map((detail): DonorCardRead => ({
              detail: { ...card, bankAccounts: detail.bankAccounts },
              bankAccounts: 'server',
            })),
            catchError(() => of(held('unavailable'))),
          ),
        );
      }),
    );
  }

  private read<Answer>(
    local: () => Answer | null,
    server: () => Observable<Answer>,
  ): Observable<Answer> {
    return this.fromCopy(local).pipe(switchMap((value) => (value === null ? server() : of(value))));
  }

  private fromCopy<Answer>(local: () => Answer | null): Observable<Answer | null> {
    return defer(() =>
      this.copy.opened()
        ? from(this.freshness()).pipe(
            map((freshness) => (freshness === 'outdated' ? null : local())),
          )
        : of(null),
    );
  }

  private async freshness(): Promise<Freshness> {
    const changed = this.changedSince;
    if (
      this.connectivity.offline() ||
      (!changed && Date.now() - this.checkedAt < REFRESH_AFTER_MS)
    ) {
      return 'kept';
    }
    const outcome = await this.download.refresh();
    if (outcome === 'stored' || outcome === 'unchanged') {
      this.checkedAt = Date.now();
      if (this.changedSince === changed) {
        this.changedSince = false;
      }
      return 'fresh';
    }
    return changed ? 'outdated' : 'kept';
  }

  private donationsRows(): DonationsCopyRows | null {
    const payments = this.payments();
    const donations = this.donations();
    const donorRecords = this.donorRecords();
    const links = this.links();
    const symbolClaims = this.symbolClaims();
    const receipts = this.receipts();
    if (
      payments === null ||
      donations === null ||
      donorRecords === null ||
      links === null ||
      symbolClaims === null ||
      receipts === null
    ) {
      return null;
    }
    return { payments, donations, donorRecords, links, symbolClaims, receipts };
  }
}

function latest(first: string | null, second: string | null): string | null {
  if (first === null || second === null) {
    return first ?? second;
  }
  return first > second ? first : second;
}
