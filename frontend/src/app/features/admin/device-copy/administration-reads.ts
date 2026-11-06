import { HttpHeaders } from '@angular/common/http';
import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { catchError, concat, defer, from, map, type Observable, of, switchMap } from 'rxjs';
import { Connectivity, isUnreachable } from '../../../core/connectivity/connectivity';
import { AdministrationWrites } from '../../../core/admin-writes/administration-writes';
import { ShownAnswers } from '../../../core/connectivity/shown-answers';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
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
  javaBlank,
  type DonationsCopyRows,
  paymentList,
} from './administration-views';

export const REFRESH_AFTER_MS = 60_000;

export type BankAccountsSource = 'server' | 'pending' | 'offline' | 'failed';

export interface DonorCardRead {
  readonly detail: AdminDonorDetailResponse;
  readonly bankAccounts: BankAccountsSource;
}

const SHOWN_COPY = 'device-copy:administration';

@Injectable({ providedIn: 'root' })
export class AdministrationReads {
  private readonly api = inject(AdminApi);
  private readonly copy = inject(AdministrationCopy);
  private readonly download = inject(AdministrationCopyDownload);
  private readonly connectivity = inject(Connectivity);
  private readonly shown = inject(ShownAnswers);
  private readonly vault = inject(DeviceVault);
  private readonly writes = inject(AdministrationWrites);
  private checkedCopy: OpenedCopy | null = null;
  private freshFor = 0;
  private checkedAt = Number.NEGATIVE_INFINITY;
  private failedAt = Number.NEGATIVE_INFINITY;

  private readonly payments = this.copy.rows<CopyPaymentRow>('donations', 'payments');
  private readonly donations = this.copy.rows<CopyDonationRow>('donations', 'donations');
  private readonly donorRecords = this.copy.rows<CopyDonorRecordRow>('donations', 'donor-records');
  private readonly links = this.copy.rows<CopyLinkRow>('donations', 'links');
  private readonly symbolClaims = this.copy.rows<CopySymbolClaimRow>('donations', 'symbol-claims');
  private readonly receipts = this.copy.rows<CopyReceiptRow>('donations', 'receipts');
  private readonly accounts = this.copy.rows<CopyAccountRow>('donors', 'accounts');

  private readonly copyTime = computed(() =>
    latest(this.download.checkedAt(), this.copy.storedAt()),
  );

  constructor() {
    effect(() => {
      const opened = this.vault.administration();
      untracked(() => this.forgetAnotherCopy(opened));
    });
  }

  changed(): void {
    this.writes.record();
  }

  paymentList(
    pairing: PairingFilter,
    query: PaymentQuery = {},
  ): Observable<AdminPaymentListResponse> {
    return this.read(
      () => {
        const rows = this.donationsRows();
        if (rows === null) {
          return null;
        }
        const answer = paymentList(rows, pairing, query);
        return pairing === 'paired' && this.listsErasedGifts(rows, answer, query) ? null : answer;
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
      const record = rows?.donorRecords.find((candidate) => candidate.donorId === donorId);
      if (
        rows === null ||
        record?.erasedAt !== null ||
        summary?.receiptsAvailableFrom === undefined
      ) {
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
          return of(held('offline'));
        }
        return concat(
          of(held('pending')),
          server.pipe(
            map((detail): DonorCardRead => ({ detail, bankAccounts: 'server' })),
            catchError((failure: unknown) =>
              of(
                held(isUnreachable(failure) || this.connectivity.offline() ? 'offline' : 'failed'),
              ),
            ),
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
        ? from(this.copyAnswers()).pipe(map((fromCopy) => (fromCopy ? this.held(local()) : null)))
        : of(null),
    );
  }

  private held<Answer>(answer: Answer | null): Answer | null {
    const time = this.copyTime();
    if (answer !== null && time !== null) {
      this.shown.record(SHOWN_COPY, new HttpHeaders(), Date.parse(time));
    }
    return answer;
  }

  private async copyAnswers(): Promise<boolean> {
    if (this.connectivity.offline()) {
      return true;
    }
    const opened = this.vault.administration();
    this.forgetAnotherCopy(opened);
    const changes = this.writes.made();
    const changed = changes !== this.freshFor;
    if (!changed && Date.now() - this.checkedAt < REFRESH_AFTER_MS) {
      return true;
    }
    if (Date.now() - this.failedAt < REFRESH_AFTER_MS) {
      return false;
    }
    const outcome = await this.download.refresh(changed);
    if (this.vault.administration() !== opened) {
      return false;
    }
    if (outcome === 'stored' || outcome === 'unchanged') {
      this.checkedAt = Date.now();
      this.failedAt = Number.NEGATIVE_INFINITY;
      this.freshFor = Math.max(this.freshFor, changes);
      return true;
    }
    this.failedAt = Date.now();
    return this.connectivity.offline();
  }

  private forgetAnotherCopy(opened: OpenedCopy | null): void {
    if (opened !== this.checkedCopy) {
      this.checkedCopy = opened;
      this.checkedAt = Number.NEGATIVE_INFINITY;
      this.failedAt = Number.NEGATIVE_INFINITY;
      this.freshFor = this.writes.made();
    }
  }

  private listsErasedGifts(
    rows: DonationsCopyRows,
    answer: AdminPaymentListResponse,
    query: PaymentQuery,
  ): boolean {
    if (this.connectivity.offline()) {
      return false;
    }
    const erased = new Set(
      rows.donorRecords.flatMap((record) => (record.erasedAt === null ? [] : [record.donorId])),
    );
    if (erased.size === 0) {
      return false;
    }
    const searched =
      query.text === undefined || javaBlank(query.text)
        ? answer.items
        : paymentList(rows, 'paired', {
            ...query,
            text: undefined,
            offset: undefined,
            limit: undefined,
          }).items;
    return searched.some((item) => item.donation !== null && erased.has(item.donation.donorId));
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
