import type { SignedReceipt } from '../../donations/verification/receipt-proof';
import type { SignedStatus } from '../../donations/verification/receipt-verifier';

export interface AdminReceiptRow {
  readonly id: string;
  readonly donorId: string;
  readonly status: 'ACTIVE' | 'REPLACED' | 'WITHDRAWN';
  readonly kind: 'SINGLE' | 'YEARLY';
  readonly number: string;
  readonly donationId: string | null;
  readonly year: number | null;
  readonly issuedOn: string;
  readonly issuedAt: string;
  readonly supersededAt: string | null;
  readonly withdrawnAt: string | null;
  readonly withdrawalReason: 'DONATIONS_CHANGED' | null;
  readonly giftCount: number;
  readonly totalAmountMinor: number;
}

export type RegisterEntry =
  | { readonly state: 'no-copy' }
  | { readonly state: 'not-held' }
  | { readonly state: 'differs'; readonly donorId: string }
  | { readonly state: 'active'; readonly donorId: string }
  | {
      readonly state: 'replaced';
      readonly donorId: string;
      readonly on: string | null;
      readonly by: string | null;
    }
  | {
      readonly state: 'withdrawn' | 'outdated';
      readonly donorId: string;
      readonly on: string | null;
    };

export type RegisterState =
  | 'loading'
  | 'active'
  | 'replaced'
  | 'withdrawn'
  | 'outdated'
  | 'differs'
  | 'not-held'
  | 'conflict'
  | 'mismatch'
  | 'missing'
  | 'stale';

export interface RegisterView {
  readonly state: RegisterState;
  readonly confirmed: boolean;
  readonly donorId: string | null;
  readonly on: string | null;
  readonly by: string | null;
}

const KEPT: readonly SignedStatus[] = ['active', 'replaced', 'withdrawn', 'outdated'];

export function registerView(
  receipt: SignedReceipt,
  rows: readonly AdminReceiptRow[] | null,
  status: SignedStatus,
): RegisterView {
  const entry = registerEntry(receipt, rows);
  const donorId = 'donorId' in entry ? entry.donorId : null;
  const on = 'on' in entry ? entry.on : null;
  const by = entry.state === 'replaced' ? entry.by : null;
  if (entry.state === 'no-copy') {
    return { state: 'loading', confirmed: false, donorId: null, on: null, by: null };
  }
  if (status === 'unknown') {
    return entry.state === 'not-held' || entry.state === 'differs'
      ? { state: entry.state, confirmed: true, donorId, on: null, by: null }
      : { state: 'conflict', confirmed: false, donorId, on: null, by: null };
  }
  if (KEPT.includes(status)) {
    if (entry.state === status) {
      return { state: entry.state, confirmed: true, donorId, on, by };
    }
    const state =
      entry.state === 'differs' ? 'mismatch' : entry.state === 'not-held' ? 'missing' : 'stale';
    return { state, confirmed: false, donorId, on: null, by: null };
  }
  return { state: entry.state, confirmed: false, donorId, on, by };
}

export function registerEntry(
  receipt: SignedReceipt,
  rows: readonly AdminReceiptRow[] | null,
): RegisterEntry {
  if (rows === null) {
    return { state: 'no-copy' };
  }
  const row = rows.find((candidate) => candidate.number === receipt.number);
  if (row === undefined) {
    return { state: 'not-held' };
  }
  if (!sameReceipt(receipt, row)) {
    return { state: 'differs', donorId: row.donorId };
  }
  switch (row.status) {
    case 'ACTIVE':
      return { state: 'active', donorId: row.donorId };
    case 'REPLACED':
      return {
        state: 'replaced',
        donorId: row.donorId,
        on: row.supersededAt,
        by: replacementOf(row, rows)?.number ?? null,
      };
    default:
      return {
        state: row.withdrawalReason === 'DONATIONS_CHANGED' ? 'outdated' : 'withdrawn',
        donorId: row.donorId,
        on: row.withdrawnAt,
      };
  }
}

function sameReceipt(receipt: SignedReceipt, row: AdminReceiptRow): boolean {
  return (
    row.kind === (receipt.kind === 'yearly' ? 'YEARLY' : 'SINGLE') &&
    row.issuedOn === receipt.issuedOn &&
    row.giftCount === receipt.gifts.length &&
    row.totalAmountMinor === receipt.totalMinor &&
    (receipt.kind === 'single' || row.year === receipt.year)
  );
}

function replacementOf(
  replaced: AdminReceiptRow,
  rows: readonly AdminReceiptRow[],
): AdminReceiptRow | undefined {
  return rows
    .filter(
      (row) =>
        row.donorId === replaced.donorId &&
        row.kind === replaced.kind &&
        Date.parse(row.issuedAt) > Date.parse(replaced.issuedAt) &&
        (row.kind === 'YEARLY'
          ? row.year === replaced.year
          : row.donationId === replaced.donationId),
    )
    .sort((first, second) => Date.parse(first.issuedAt) - Date.parse(second.issuedAt))[0];
}
