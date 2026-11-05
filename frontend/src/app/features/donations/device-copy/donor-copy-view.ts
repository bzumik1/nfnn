/// <reference types="@angular/localize" />

import type { CopyContents, StoredImage } from '../../../core/device/store/account-store';
import type {
  DonationItem,
  DonationPairing,
  DonationSource,
  DonationStatus,
  DonationSummaryResponse,
  YearTotal,
} from '../donations-api';
import type { IssuedReceipt, ReceiptSubject } from '../receipt-pdf/frozen-receipt';

export type DonationPurpose = 'GENERAL' | 'ACCOUNT_VERIFICATION';

export interface DonationRow {
  readonly id: string;
  readonly receivedAt: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: DonationStatus;
  readonly source: DonationSource;
  readonly purpose: DonationPurpose;
  readonly pairedBy: DonationPairing | null;
  readonly bankAccountId: string | null;
  readonly symbolClaimId: string | null;
}

export interface BankAccountRow {
  readonly id: string;
  readonly accountNumber: string;
}

export interface SymbolClaimRow {
  readonly id: string;
  readonly accountNumber: string;
  readonly variableSymbol: string;
  readonly answer: 'CONFIRMED' | 'DECLINED';
}

export interface CopySummary extends DonationSummaryResponse {
  readonly bankDataAsOf: string | null;
}

export type DonationFigures = Pick<
  DonationSummaryResponse,
  'totalAmountMinor' | 'currency' | 'count' | 'lastReceivedAt' | 'byYear'
>;

export interface SummarizedDonation {
  readonly receivedAt: string;
  readonly amountMinor: number;
  readonly status: DonationStatus;
}

export interface DonorCopyView {
  readonly summary: CopySummary;
  readonly items: readonly DonationItem[];
  readonly receipts: readonly IssuedReceipt[];
  readonly images: readonly StoredImage[];
  readonly agrees: boolean;
}

const DONATIONS_CHUNK = /^donations:(\d{4})$/;
const RECEIPTS_CHUNK = /^receipts:\d{4}$/;
const BANK_ACCOUNTS_CHUNK = 'bank-accounts';
const SYMBOL_CLAIMS_CHUNK = 'symbol-claims';
const CURRENCY = 'CZK';

const PURPOSE_TEXTS: Readonly<Record<DonationPurpose, string>> = {
  GENERAL: $localize`:@@donor.dashboard.purpose.general:Obecný příspěvek`,
  ACCOUNT_VERIFICATION: $localize`:@@donor.dashboard.purpose.accountVerification:Ověření účtu`,
};

export function summarizeDonations(donations: readonly SummarizedDonation[]): DonationFigures {
  const received = donations.filter((donation) => donation.status === 'RECEIVED');
  const byYear = new Map<number, { count: number; totalAmountMinor: number }>();
  let lastReceivedAt: string | null = null;
  let totalAmountMinor = 0;
  for (const donation of received) {
    totalAmountMinor += donation.amountMinor;
    if (lastReceivedAt === null || donation.receivedAt > lastReceivedAt) {
      lastReceivedAt = donation.receivedAt;
    }
    const year = Number(donation.receivedAt.slice(0, 4));
    const entry = byYear.get(year) ?? { count: 0, totalAmountMinor: 0 };
    byYear.set(year, {
      count: entry.count + 1,
      totalAmountMinor: entry.totalAmountMinor + donation.amountMinor,
    });
  }
  const years: YearTotal[] = [...byYear.entries()]
    .sort(([first], [second]) => second - first)
    .map(([year, entry]) => ({ year, ...entry }));
  return {
    totalAmountMinor,
    currency: CURRENCY,
    count: received.length,
    lastReceivedAt,
    byYear: years,
  };
}

export function donorCopyView(contents: CopyContents | null): DonorCopyView | null {
  if (contents === null || !isCopySummary(contents.summary)) {
    return null;
  }
  const summary = contents.summary;
  const donations = donationRowsOf(contents);
  const receipts = rowsOf(contents, (id) => RECEIPTS_CHUNK.test(id)).filter(isIssuedReceipt);
  const accounts = new Map(
    rowsOf(contents, (id) => id === BANK_ACCOUNTS_CHUNK)
      .filter(isBankAccountRow)
      .map((row) => [row.id, row.accountNumber]),
  );
  const symbols = new Map(
    rowsOf(contents, (id) => id === SYMBOL_CLAIMS_CHUNK)
      .filter(isSymbolClaimRow)
      .map((row) => [row.id, row.variableSymbol]),
  );
  const singleNumbers = new Map(
    receipts
      .filter((receipt) => receipt.kind === 'SINGLE' && receipt.status === 'ACTIVE')
      .map((receipt) => [receipt.donationId, receipt.number]),
  );
  const items = donations.map((row): DonationItem => {
    const received = row.status === 'RECEIVED';
    const verification = row.purpose === 'ACCOUNT_VERIFICATION';
    return {
      id: row.id,
      receiptNumber: received ? (singleNumbers.get(row.id) ?? null) : null,
      receivedAt: row.receivedAt,
      amountMinor: row.amountMinor,
      currency: row.currency,
      purpose: PURPOSE_TEXTS[row.purpose] ?? PURPOSE_TEXTS.GENERAL,
      status: row.status,
      source: row.source,
      pairedBy: row.pairedBy,
      senderAccount: row.bankAccountId === null ? null : (accounts.get(row.bankAccountId) ?? null),
      confirmedSymbol: row.symbolClaimId === null ? null : (symbols.get(row.symbolClaimId) ?? null),
      accountVerification: verification,
      receiptAvailable:
        received &&
        !verification &&
        Number(row.receivedAt.slice(0, 4)) >= summary.receiptsAvailableFrom,
    };
  });
  return {
    summary,
    items,
    receipts,
    images: contents.images ?? [],
    agrees: figuresAgree(summarizeDonations(donations), summary),
  };
}

export function activeReceiptOf(
  view: DonorCopyView,
  subject: ReceiptSubject,
): IssuedReceipt | null {
  return (
    view.receipts.find(
      (receipt) =>
        receipt.status === 'ACTIVE' &&
        ('year' in subject
          ? receipt.kind === 'YEARLY' && receipt.year === subject.year
          : receipt.kind === 'SINGLE' && receipt.donationId === subject.donationId),
    ) ?? null
  );
}

export function imageDigestsOf(receipts: readonly IssuedReceipt[]): string[] {
  const digests = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.status !== 'ACTIVE') {
      continue;
    }
    const signatory = receipt.receipt?.signatory;
    for (const image of [signatory?.signatureImage, signatory?.portraitImage]) {
      if (typeof image?.sha256 === 'string') {
        digests.add(image.sha256);
      }
    }
  }
  return [...digests].sort();
}

export function issuedReceiptsOf(contents: CopyContents): IssuedReceipt[] {
  return rowsOf(contents, (id) => RECEIPTS_CHUNK.test(id)).filter(isIssuedReceipt);
}

function figuresAgree(computed: DonationFigures, summary: DonationSummaryResponse): boolean {
  return (
    computed.totalAmountMinor === summary.totalAmountMinor &&
    computed.count === summary.count &&
    computed.lastReceivedAt === summary.lastReceivedAt &&
    computed.byYear.length === summary.byYear.length &&
    computed.byYear.every(
      (entry, index) =>
        entry.year === summary.byYear[index].year &&
        entry.count === summary.byYear[index].count &&
        entry.totalAmountMinor === summary.byYear[index].totalAmountMinor,
    )
  );
}

function donationRowsOf(contents: CopyContents): DonationRow[] {
  return contents.chunks
    .map((chunk) => ({ chunk, year: DONATIONS_CHUNK.exec(chunk.id)?.[1] }))
    .filter((entry) => entry.year !== undefined)
    .sort((first, second) => Number(second.year) - Number(first.year))
    .flatMap((entry) => entry.chunk.rows.filter(isDonationRow));
}

function rowsOf(contents: CopyContents, kept: (id: string) => boolean): unknown[] {
  return contents.chunks.filter((chunk) => kept(chunk.id)).flatMap((chunk) => chunk.rows);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDonationRow(value: unknown): value is DonationRow {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['receivedAt'] === 'string' &&
    Number.isSafeInteger(value['amountMinor']) &&
    (value['status'] === 'RECEIVED' || value['status'] === 'REFUNDED')
  );
}

function isIssuedReceipt(value: unknown): value is IssuedReceipt {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['number'] === 'string' &&
    (value['kind'] === 'SINGLE' || value['kind'] === 'YEARLY') &&
    typeof value['status'] === 'string'
  );
}

function isBankAccountRow(value: unknown): value is BankAccountRow {
  return (
    isRecord(value) && typeof value['id'] === 'string' && typeof value['accountNumber'] === 'string'
  );
}

function isSymbolClaimRow(value: unknown): value is SymbolClaimRow {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['variableSymbol'] === 'string'
  );
}

function isCopySummary(value: unknown): value is CopySummary {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value['totalAmountMinor']) &&
    Number.isSafeInteger(value['count']) &&
    Array.isArray(value['byYear']) &&
    Number.isSafeInteger(value['yearlyReceiptsAvailableThrough']) &&
    Number.isSafeInteger(value['receiptsAvailableFrom'])
  );
}
