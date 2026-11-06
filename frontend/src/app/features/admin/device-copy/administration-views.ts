/// <reference types="@angular/localize" />

import type {
  AdminDonorDetailResponse,
  AdminDonorRecordResponse,
  AdminDonorResponse,
  AdminDonorSearchResponse,
  AdminPaymentListResponse,
  AdminPaymentResponse,
  AdminReceiptResponse,
  DonorAccountListResponse,
  DonorAccountResponse,
  PairingFilter,
  PairingMethod,
  PaymentQuery,
  ReceiptKind,
  ReceiptWithdrawalReason,
} from '../admin-api';
import type {
  DonationItem,
  DonationPairing,
  DonationSource,
  DonationStatus,
} from '../../donations/donations-api';

export type CopyPaymentRow = Omit<AdminPaymentResponse, 'donation'>;

export interface CopyDonationRow {
  readonly id: string;
  readonly donorId: string;
  readonly paymentId: string | null;
  readonly receivedAt: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: DonationStatus;
  readonly source: DonationSource;
  readonly purpose: 'GENERAL' | 'ACCOUNT_VERIFICATION';
  readonly pairedBy: PairingMethod | null;
  readonly bankAccountId: string | null;
  readonly symbolClaimId: string | null;
  readonly recordedAt: string;
}

export type CopyDonorRecordRow = AdminDonorRecordResponse;

export interface CopyLinkRow {
  readonly id: string;
  readonly donorId: string;
  readonly accountNumber: string;
}

export interface CopySymbolClaimRow {
  readonly id: string;
  readonly donorId: string;
  readonly variableSymbol: string;
}

export interface CopyReceiptRow {
  readonly id: string;
  readonly donorId: string;
  readonly status: 'ACTIVE' | 'REPLACED' | 'WITHDRAWN';
  readonly kind: ReceiptKind;
  readonly number: string;
  readonly donationId: string | null;
  readonly year: number | null;
  readonly issuedOn: string;
  readonly issuedAt: string;
  readonly withdrawnAt: string | null;
  readonly withdrawalReason: ReceiptWithdrawalReason | null;
  readonly locale: string;
  readonly keyId: string;
}

export type CopyAccountRow = DonorAccountResponse;

export interface DonationsCopyRows {
  readonly payments: readonly CopyPaymentRow[];
  readonly donations: readonly CopyDonationRow[];
  readonly donorRecords: readonly CopyDonorRecordRow[];
  readonly links: readonly CopyLinkRow[];
  readonly symbolClaims: readonly CopySymbolClaimRow[];
  readonly receipts: readonly CopyReceiptRow[];
}

export interface ReceiptYearsSummary {
  readonly today: string;
  readonly receiptsAvailableFrom: number;
}

export const DONOR_RECORD_SEARCH_LIMIT = 20;
export const ACCOUNT_SEARCH_LIMIT = 20;

const PURPOSE_TEXTS: Readonly<Record<CopyDonationRow['purpose'], string>> = {
  GENERAL: $localize`:@@admin.donorDetail.purpose.general:Obecný příspěvek`,
  ACCOUNT_VERIFICATION: $localize`:@@admin.donorDetail.purpose.accountVerification:Ověření účtu`,
};
const ACCENTED = 'áäčďéěëíĺľňóôöŕřšťúůüýžÁÄČĎÉĚËÍĹĽŇÓÔÖŔŘŠŤÚŮÜÝŽ';
const PLAIN = 'aacdeeeillnooorrstuuuyzaacdeeeillnooorrstuuuyz';
const AMOUNT_SPACES = /[ \t\n\v\f\r\u00a0\u202f]+/g;
const CROWNS = /^(\d{1,12})(?:[.,](\d{1,2}))?(?:kc|czk)?$/;
const HELLERS_PER_CROWN = 100;
const NAMES = new Intl.Collator('cs');

export function paymentList(
  rows: DonationsCopyRows,
  pairing: PairingFilter,
  query: PaymentQuery & { readonly year?: number },
): AdminPaymentListResponse {
  const text = plainQuery(query.text);
  const filter = (item: AdminPaymentResponse): boolean => matches(item, query, text);
  if (pairing === 'unpaired') {
    const paid = new Set(rows.donations.flatMap((donation) => donation.paymentId ?? []));
    const matching = rows.payments
      .filter((payment) => !paid.has(payment.id))
      .map((payment): AdminPaymentResponse => ({ ...payment, donation: null }))
      .filter(filter)
      .sort(newestBookingFirst);
    return { year: null, availableYears: [], items: page(matching, query), total: matching.length };
  }
  const availableYears = [
    ...new Set(rows.donations.map((donation) => yearOf(donation.receivedAt))),
  ].sort((first, second) => second - first);
  const year = query.year ?? null;
  if (year === null && availableYears.length === 0) {
    return { year: null, availableYears, items: [], total: 0 };
  }
  const firstDay =
    year !== null
      ? `${pad(year)}-01-01`
      : later(`${pad(availableYears.at(-1) ?? 0)}-01-01`, query.from);
  const lastDay =
    year !== null
      ? `${pad(year)}-12-31`
      : earlier(`${pad(availableYears[0] ?? 0)}-12-31`, query.to);
  if (firstDay > lastDay) {
    return { year, availableYears, items: [], total: 0 };
  }
  const payments = new Map(rows.payments.map((payment) => [payment.id, payment]));
  const donors = new Map(rows.donorRecords.map((record) => [record.donorId, record]));
  const withReceipt = new Set(rows.receipts.flatMap((receipt) => receipt.donationId ?? []));
  const matching = rows.donations
    .filter((donation) => donation.receivedAt >= firstDay && donation.receivedAt <= lastDay)
    .flatMap((donation): AdminPaymentResponse[] => {
      const payment = donation.paymentId === null ? undefined : payments.get(donation.paymentId);
      if (payment === undefined || donation.pairedBy === null) {
        return [];
      }
      return [
        {
          ...payment,
          donation: {
            id: donation.id,
            donorId: donation.donorId,
            donorName: donors.get(donation.donorId)?.name ?? null,
            pairedBy: donation.pairedBy,
            status: donation.status,
            recordedAt: donation.recordedAt,
            receiptIssued: withReceipt.has(donation.id),
          },
        },
      ];
    })
    .filter(filter)
    .sort(newestBookingFirst);
  return { year, availableYears, items: page(matching, query), total: matching.length };
}

export function donorRecordSearch(
  records: readonly CopyDonorRecordRow[],
  query: string,
): AdminDonorSearchResponse {
  const trimmed = query.trim();
  if (trimmed === '') {
    return { items: [] };
  }
  const folded = foldAccents(trimmed);
  const items = records
    .filter(
      (record) =>
        record.erasedAt === null &&
        (foldAccents(record.name).includes(folded) || record.variableSymbol.startsWith(folded)),
    )
    .sort(
      (first, second) =>
        NAMES.compare(first.name, second.name) || byText(first.donorId, second.donorId),
    )
    .slice(0, DONOR_RECORD_SEARCH_LIMIT)
    .map((record): AdminDonorResponse => ({
      donorId: record.donorId,
      name: record.name,
      type: record.type,
      variableSymbol: record.variableSymbol,
      companyIdentifier: record.companyIdentifier,
    }));
  return { items };
}

export function accountSearch(
  accounts: readonly CopyAccountRow[],
  query: string,
  page = 0,
  limit = ACCOUNT_SEARCH_LIMIT,
): DonorAccountListResponse {
  const folded = foldAccents(query.trim());
  const found = accounts
    .filter(
      (account) =>
        foldAccents(account.name).includes(folded) ||
        foldAccents(account.email).includes(folded) ||
        account.variableSymbol.startsWith(folded),
    )
    .sort(
      (first, second) =>
        NAMES.compare(first.name, second.name) || NAMES.compare(first.email, second.email),
    );
  const start = page * limit;
  return { items: found.slice(start, start + limit), hasMore: found.length > start + limit };
}

export function donorCard(
  rows: DonationsCopyRows,
  donorId: string,
  summary: ReceiptYearsSummary,
): Omit<AdminDonorDetailResponse, 'bankAccounts'> | null {
  const donor = rows.donorRecords.find((record) => record.donorId === donorId);
  if (donor === undefined) {
    return null;
  }
  const accounts = new Map(
    rows.links.filter((link) => link.donorId === donorId).map((link) => [link.id, link]),
  );
  const symbols = new Map(
    rows.symbolClaims
      .filter((claim) => claim.donorId === donorId)
      .map((claim) => [claim.id, claim]),
  );
  const receipts = rows.receipts.filter((receipt) => receipt.donorId === donorId);
  const singleNumbers = new Map(
    receipts
      .filter((receipt) => receipt.status === 'ACTIVE' && receipt.kind === 'SINGLE')
      .flatMap((receipt) =>
        receipt.donationId === null ? [] : [[receipt.donationId, receipt.number] as const],
      ),
  );
  const gifts = rows.donations
    .filter((donation) => donation.donorId === donorId)
    .sort(
      (first, second) =>
        byText(second.receivedAt, first.receivedAt) ||
        byText(second.recordedAt, first.recordedAt) ||
        byText(second.id, first.id),
    );
  const received = gifts.filter((gift) => gift.status === 'RECEIVED');
  const receivedOn = new Map(gifts.map((gift) => [gift.id, gift.receivedAt]));
  return {
    donor,
    donations: {
      items: gifts.map((gift): DonationItem => ({
        id: gift.id,
        receiptNumber: gift.status === 'RECEIVED' ? (singleNumbers.get(gift.id) ?? null) : null,
        receivedAt: gift.receivedAt,
        amountMinor: gift.amountMinor,
        currency: gift.currency,
        purpose: PURPOSE_TEXTS[gift.purpose],
        status: gift.status,
        source: gift.source,
        pairedBy: gift.pairedBy as DonationPairing | null,
        senderAccount:
          gift.bankAccountId === null
            ? null
            : (accounts.get(gift.bankAccountId)?.accountNumber ?? null),
        confirmedSymbol:
          gift.symbolClaimId === null
            ? null
            : (symbols.get(gift.symbolClaimId)?.variableSymbol ?? null),
        accountVerification: gift.purpose === 'ACCOUNT_VERIFICATION',
        receiptAvailable:
          gift.status === 'RECEIVED' &&
          gift.purpose !== 'ACCOUNT_VERIFICATION' &&
          yearOf(gift.receivedAt) >= summary.receiptsAvailableFrom,
      })),
      totalAmountMinor: received.reduce((total, gift) => total + gift.amountMinor, 0),
      currency: 'CZK',
      count: received.length,
    },
    receipts: receipts
      .sort(
        (first, second) =>
          byText(second.issuedAt, first.issuedAt) || byText(second.number, first.number),
      )
      .map((receipt): AdminReceiptResponse => ({
        id: receipt.id,
        number: receipt.number,
        kind: receipt.kind,
        donationId: receipt.donationId,
        donationReceivedOn:
          receipt.donationId === null ? null : (receivedOn.get(receipt.donationId) ?? null),
        year: receipt.year,
        issuedOn: receipt.issuedOn,
        issuedAt: receipt.issuedAt,
        locale: receipt.locale,
        active: receipt.status === 'ACTIVE',
        withdrawnAt: receipt.withdrawnAt,
        withdrawalReason: receipt.withdrawalReason,
        keyId: receipt.keyId,
      })),
    yearlyReceiptsAvailableThrough: yearOf(summary.today) - 1,
    receiptsAvailableFrom: summary.receiptsAvailableFrom,
  };
}

export function foldAccents(text: string): string {
  let folded = '';
  for (const letter of text) {
    const accented = ACCENTED.indexOf(letter);
    folded += accented >= 0 ? PLAIN[accented] : letter;
  }
  return folded.toLowerCase();
}

function plainQuery(text: string | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : plain(trimmed);
}

function plain(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

function matches(item: AdminPaymentResponse, query: PaymentQuery, text: string | null): boolean {
  if (
    (query.from !== undefined && query.from !== '' && item.bookedOn < query.from) ||
    (query.to !== undefined && query.to !== '' && item.bookedOn > query.to)
  ) {
    return false;
  }
  if (
    query.donorId !== undefined &&
    query.donorId !== '' &&
    item.donation?.donorId !== query.donorId
  ) {
    return false;
  }
  if (text === null) {
    return true;
  }
  const searchable = [
    String(item.bankTransactionId),
    item.variableSymbol,
    item.counterpartyAccount,
    item.counterpartyName,
    item.messageForRecipient,
    item.donation?.donorName ?? null,
  ];
  return (
    searchable.some((value) => value !== null && plain(value).includes(text)) ||
    amountMinorOf(text) === item.amountMinor
  );
}

function amountMinorOf(text: string): number | null {
  const crowns = CROWNS.exec(text.replace(AMOUNT_SPACES, ''));
  if (crowns === null) {
    return null;
  }
  const hellers = crowns[2] === undefined ? '00' : `${crowns[2]}0`.slice(0, 2);
  return Number(crowns[1]) * HELLERS_PER_CROWN + Number(hellers);
}

function page<T>(items: readonly T[], query: PaymentQuery): T[] {
  const start = query.offset ?? 0;
  return query.limit === undefined ? items.slice(start) : items.slice(start, start + query.limit);
}

function newestBookingFirst(first: AdminPaymentResponse, second: AdminPaymentResponse): number {
  return (
    byText(second.bookedOn, first.bookedOn) || second.bankTransactionId - first.bankTransactionId
  );
}

function byText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function yearOf(day: string): number {
  return Number(day.slice(0, 4));
}

function pad(year: number): string {
  return String(year).padStart(4, '0');
}

function later(day: string, bound: string | undefined): string {
  return bound !== undefined && bound !== '' && bound > day ? bound : day;
}

function earlier(day: string, bound: string | undefined): string {
  return bound !== undefined && bound !== '' && bound < day ? bound : day;
}
