import { HttpHeaders } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import {
  catchError,
  concat,
  defer,
  from,
  map,
  type Observable,
  of,
  switchMap,
  throwError,
} from 'rxjs';
import { Connectivity, isUnreachable } from '../../../core/connectivity/connectivity';
import { AdministrationWrites } from '../../../core/admin-writes/administration-writes';
import { ShownAnswers } from '../../../core/connectivity/shown-answers';
import {
  COPY_CHANNELS,
  type CopyChannel,
  DeviceVault,
  type OpenedCopy,
} from '../../../core/device/store/device-vault';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import { canonicalRows } from '../../donations/sync/canonical-rows';
import {
  AdminApi,
  type AdminOverviewResponse,
  type AdminDonorDetailResponse,
  type AdminDonorSearchResponse,
  type AdminPaymentListResponse,
  type DonorAccountListResponse,
  type DonorAccountResponse,
  type ImportFailureKind,
  type ImportStateResponse,
  type PairingFilter,
  type PaymentQuery,
} from '../admin-api';
import { AdministrationCopy } from './administration-copy';
import { AdministrationCopyDownload } from './administration-copy-download';
import { everyOfferedYear, yearOverview } from './administration-overview';
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
export const FORCED_REFRESH_GAP_MS = 30_000;
export const RATE_LIMITED_PAUSE_MS = 5 * 60_000;
export const CHECKS_CHANNEL = 'nfnn.administration-checks';
export const MISMATCH_REPORT_PAUSE_MS = 60 * 60_000;

export type BankAccountsSource = 'server' | 'pending' | 'offline' | 'failed';

export interface DonorCardRead {
  readonly detail: AdminDonorDetailResponse;
  readonly bankAccounts: BankAccountsSource;
}

export type StoredImportState = Omit<ImportStateResponse, 'historyImport' | 'defaultHistoryFrom'>;

export type ImportStateRead =
  | { readonly source: 'server'; readonly state: ImportStateResponse }
  | { readonly source: 'copy'; readonly state: StoredImportState };

interface CopyImportStateRow extends Omit<StoredImportState, 'lastFailure'> {
  readonly lastFailure: {
    readonly kind: ImportFailureKind;
    readonly attemptedAt: string | null;
  } | null;
}

interface CheckMessage {
  readonly copyId: string;
  readonly storedAt: string | null;
  readonly kind: 'checked' | 'rate-limited';
  readonly at: number;
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
  private readonly reporter = inject(ErrorReporter);
  private readonly checks: CopyChannel | null = inject(COPY_CHANNELS)(CHECKS_CHANNEL);
  private checkedCopy: OpenedCopy | null = null;
  private freshFor = 0;
  private checkedAt = Number.NEGATIVE_INFINITY;
  private startedAt = Number.NEGATIVE_INFINITY;
  private failedAt = Number.NEGATIVE_INFINITY;
  private pausedUntil = Number.NEGATIVE_INFINITY;
  private reportedDisagreement: string | null = null;
  private reportedDisagreementAt = Number.NEGATIVE_INFINITY;

  private readonly payments = this.copy.rows<CopyPaymentRow>('donations', 'payments');
  private readonly donations = this.copy.rows<CopyDonationRow>('donations', 'donations');
  private readonly donorRecords = this.copy.rows<CopyDonorRecordRow>('donations', 'donor-records');
  private readonly links = this.copy.rows<CopyLinkRow>('donations', 'links');
  private readonly symbolClaims = this.copy.rows<CopySymbolClaimRow>('donations', 'symbol-claims');
  private readonly receipts = this.copy.rows<CopyReceiptRow>('donations', 'receipts');
  private readonly accounts = this.copy.rows<CopyAccountRow>('donors', 'accounts');
  private readonly importStates = this.copy.rows<CopyImportStateRow>('donations', 'import-state');

  private readonly overviews = computed(() => {
    const rows = this.donationsRows();
    const summary = this.copy.summary();
    if (rows === null || summary === null) {
      return null;
    }
    const years = everyOfferedYear(rows, summary.today);
    return {
      rows,
      today: summary.today,
      years,
      agrees: canonicalRows(years) === canonicalRows(projected(summary.byYear, years) as unknown[]),
    };
  });

  readonly copyTime = computed(() => latest(this.download.checkedAt(), this.copy.storedAt()));

  constructor() {
    effect(() => {
      const opened = this.vault.administration();
      untracked(() => this.forgetAnotherCopy(opened));
    });
    this.checks?.addEventListener('message', (event: Event) =>
      this.heardCheck((event as MessageEvent<unknown>).data),
    );
    inject(DestroyRef).onDestroy(() => this.checks?.close());
  }

  changed(): void {
    this.writes.record();
  }

  paymentList(
    pairing: PairingFilter,
    query: PaymentQuery = {},
  ): Observable<AdminPaymentListResponse> {
    return this.copyFirst(
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
    return this.copyFirst(
      () => {
        const records = this.donorRecords();
        return records === null ? null : donorRecordSearch(records, query);
      },
      () => this.api.searchDonors(query),
    );
  }

  accountList(query: string, limit?: number): Observable<DonorAccountListResponse> {
    return this.copyFirst(
      () => {
        const accounts = this.accounts();
        return accounts === null ? null : accountSearch(accounts, query, 0, limit);
      },
      () => this.api.donors(query, limit),
    );
  }

  account(donorId: string): Observable<DonorAccountResponse> {
    return this.copyFirst(
      () => this.accounts()?.find((account) => account.donorId === donorId) ?? null,
      () => this.api.donor(donorId),
    );
  }

  overview(year: number | null = null): Observable<AdminOverviewResponse> {
    return this.copyFirst(
      () => {
        const held = this.overviews();
        if (held === null) {
          return null;
        }
        if (!held.agrees) {
          this.reportDisagreement();
          return null;
        }
        const asked = year ?? held.years[0]?.year;
        const compiled = held.years.find((entry) => entry.year === asked);
        return compiled === undefined
          ? yearOverview(held.rows, held.today, year)
          : { ...compiled, availableYears: held.years.map((entry) => entry.year) };
      },
      () => this.api.overview(year),
    );
  }

  importState(): Observable<ImportStateRead> {
    return this.serverFirst(
      () => {
        const row = this.importStates()?.[0];
        return row === undefined ? null : { source: 'copy', state: storedImportState(row) };
      },
      () =>
        this.api.importState().pipe(map((state): ImportStateRead => ({ source: 'server', state }))),
    );
  }

  serverFirst<Answer>(
    local: () => Answer | null,
    server: () => Observable<Answer>,
  ): Observable<Answer> {
    const fromCopy = (): Answer | null => (this.copy.opened() ? local() : null);
    return defer(() => {
      const offline = this.connectivity.offline() ? fromCopy() : null;
      if (offline !== null) {
        this.held(offline);
        return of(offline);
      }
      return server().pipe(
        catchError((failure: unknown) => {
          const held = isUnreachable(failure) || this.connectivity.offline() ? fromCopy() : null;
          if (held === null) {
            return throwError(() => failure);
          }
          this.held(held);
          return of(held);
        }),
      );
    });
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

  copyFirst<Answer>(
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
    const now = Date.now();
    if (!changed && now - this.checkedAt < REFRESH_AFTER_MS) {
      return true;
    }
    if (now < this.pausedUntil || now - this.failedAt < REFRESH_AFTER_MS) {
      return false;
    }
    if (changed && now - this.startedAt < FORCED_REFRESH_GAP_MS) {
      return false;
    }
    this.startedAt = now;
    const outcome = await this.download.refresh(changed);
    if (this.vault.administration() !== opened) {
      return false;
    }
    if (outcome === 'stored' || outcome === 'unchanged') {
      this.checkedAt = Date.now();
      this.failedAt = Number.NEGATIVE_INFINITY;
      this.freshFor = Math.max(this.freshFor, changes);
      if (outcome === 'unchanged') {
        this.tellOtherTabs(opened, 'checked', this.checkedAt);
      }
      return true;
    }
    this.failedAt = Date.now();
    if (outcome === 'rate-limited') {
      this.pausedUntil = this.failedAt + RATE_LIMITED_PAUSE_MS;
      this.tellOtherTabs(opened, 'rate-limited', this.pausedUntil);
    }
    return this.connectivity.offline();
  }

  private forgetAnotherCopy(opened: OpenedCopy | null): void {
    if (opened !== this.checkedCopy) {
      this.checkedCopy = opened;
      this.checkedAt = Number.NEGATIVE_INFINITY;
      this.startedAt = Number.NEGATIVE_INFINITY;
      this.failedAt = Number.NEGATIVE_INFINITY;
      this.pausedUntil = Number.NEGATIVE_INFINITY;
      this.reportedDisagreement = null;
      this.freshFor = this.download.writesAtStart(opened) ?? this.writes.made();
    }
  }

  private tellOtherTabs(opened: OpenedCopy | null, kind: CheckMessage['kind'], at: number): void {
    if (opened !== null) {
      this.checks?.postMessage({
        copyId: opened.store.copyId,
        storedAt: this.copy.storedAt(),
        kind,
        at,
      } satisfies CheckMessage);
    }
  }

  private heardCheck(message: unknown): void {
    const opened = this.vault.administration();
    if (!isCheckMessage(message) || opened === null || message.copyId !== opened.store.copyId) {
      return;
    }
    this.forgetAnotherCopy(opened);
    const now = Date.now();
    if (message.kind === 'checked') {
      if (message.storedAt !== this.copy.storedAt()) {
        return;
      }
      this.checkedAt = Math.max(this.checkedAt, Math.min(message.at, now));
    } else {
      this.pausedUntil = Math.max(
        this.pausedUntil,
        Math.min(message.at, now + RATE_LIMITED_PAUSE_MS),
      );
    }
  }

  private reportDisagreement(): void {
    const contents = `${this.vault.administration()?.store.copyId ?? ''} ${this.copy.storedAt() ?? ''}`;
    const now = Date.now();
    if (
      this.reportedDisagreement === contents ||
      now - this.reportedDisagreementAt < MISMATCH_REPORT_PAUSE_MS
    ) {
      return;
    }
    this.reportedDisagreement = contents;
    this.reportedDisagreementAt = now;
    this.reporter.report('device-copy-mismatch', 'global');
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

function storedImportState(row: CopyImportStateRow): StoredImportState {
  return {
    ...row,
    lastFailure:
      row.lastFailure === null
        ? null
        : { kind: row.lastFailure.kind, message: null, attemptedAt: row.lastFailure.attemptedAt },
  };
}

function isCheckMessage(message: unknown): message is CheckMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const candidate = message as Record<string, unknown>;
  return (
    typeof candidate['copyId'] === 'string' &&
    (typeof candidate['storedAt'] === 'string' || candidate['storedAt'] === null) &&
    (candidate['kind'] === 'checked' || candidate['kind'] === 'rate-limited') &&
    typeof candidate['at'] === 'number' &&
    Number.isFinite(candidate['at'])
  );
}

function projected(source: unknown, shape: unknown): unknown {
  if (Array.isArray(source) && Array.isArray(shape)) {
    return source.map((item: unknown, index) => projected(item, shape[index] ?? shape[0]));
  }
  if (isRecord(source) && isRecord(shape)) {
    return Object.fromEntries(
      Object.keys(shape).map((key) => [key, projected(source[key], shape[key])]),
    );
  }
  return source;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function latest(first: string | null, second: string | null): string | null {
  if (first === null || second === null) {
    return first ?? second;
  }
  return first > second ? first : second;
}
