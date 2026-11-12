import type { CopyContents } from '../../../core/device/store/account-store';
import { copyRows } from './administration-copy';
import {
  type CopyAccountRow,
  type CopyDonationRow,
  type CopyDonorRecordRow,
  type CopyPaymentRow,
  type CopyReceiptRow,
  inCzechOrder,
} from './administration-views';

export interface CopyAuditRow {
  readonly id: string;
  readonly adminId: string;
  readonly action: string;
  readonly subjectId: string | null;
  readonly performedAt: string;
  readonly client: string | null;
}

export interface PaymentsTally {
  readonly count: number;
  readonly totalMinor: number;
}

export interface BookedPaymentsTally extends PaymentsTally {
  readonly bookedFrom: string | null;
}

export interface OtherAdministrator {
  readonly adminId: string;
  readonly name: string | null;
  readonly actions: number;
}

export interface VisitChanges {
  readonly payments: PaymentsTally;
  readonly paired: BookedPaymentsTally;
  readonly unpaired: BookedPaymentsTally;
  readonly newDonors: number;
  readonly receipts: number;
  readonly otherAdministrators: readonly OtherAdministrator[];
  readonly anything: boolean;
}

export interface VisitMark {
  readonly at: string;
  readonly payments: readonly string[];
  readonly donors: readonly string[];
  readonly receipts: readonly string[];
  readonly actions: readonly string[];
}

export function markOf(contents: CopyContents, at: string): VisitMark {
  return {
    at,
    payments: copyRows<CopyPaymentRow>(contents, 'donations', 'payments').map(({ id }) => id),
    donors: copyRows<CopyDonorRecordRow>(contents, 'donations', 'donor-records').map(
      ({ donorId }) => donorId,
    ),
    receipts: copyRows<CopyReceiptRow>(contents, 'donations', 'receipts').map(({ id }) => id),
    actions: copyRows<CopyAuditRow>(contents, 'donors', 'audit').map(({ id }) => id),
  };
}

export function isVisitMark(value: unknown): value is VisitMark {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const mark = value as Record<string, unknown>;
  return (
    typeof mark['at'] === 'string' &&
    MARKED_KINDS.every(
      (kind) =>
        Array.isArray(mark[kind]) &&
        (mark[kind] as unknown[]).every((id) => typeof id === 'string'),
    )
  );
}

export function visitChanges(
  mark: VisitMark,
  after: CopyContents,
  administratorId: string,
): VisitChanges {
  const newPayments = added(
    mark.payments,
    copyRows<CopyPaymentRow>(after, 'donations', 'payments'),
    (payment) => payment.id,
  );
  const paid = new Set(
    copyRows<CopyDonationRow>(after, 'donations', 'donations').flatMap(
      (donation) => donation.paymentId ?? [],
    ),
  );
  const newDonors = added(
    mark.donors,
    copyRows<CopyDonorRecordRow>(after, 'donations', 'donor-records'),
    (record) => record.donorId,
  ).length;
  const receipts = added(
    mark.receipts,
    copyRows<CopyReceiptRow>(after, 'donations', 'receipts'),
    (receipt) => receipt.id,
  ).length;
  const otherAdministrators = othersIn(
    added(
      mark.actions,
      copyRows<CopyAuditRow>(after, 'donors', 'audit'),
      (entry) => entry.id,
    ).filter((entry) => entry.adminId !== administratorId),
    copyRows<CopyAccountRow>(after, 'donors', 'accounts'),
  );
  const payments = tally(newPayments);
  return {
    payments,
    paired: booked(newPayments.filter((payment) => paid.has(payment.id))),
    unpaired: booked(newPayments.filter((payment) => !paid.has(payment.id))),
    newDonors,
    receipts,
    otherAdministrators,
    anything: payments.count > 0 || newDonors > 0 || receipts > 0 || otherAdministrators.length > 0,
  };
}

const MARKED_KINDS = ['payments', 'donors', 'receipts', 'actions'] as const;

function added<T>(held: readonly string[], after: readonly T[], idOf: (row: T) => string): T[] {
  const seen = new Set(held);
  return after.filter((row) => !seen.has(idOf(row)));
}

function tally(payments: readonly CopyPaymentRow[]): PaymentsTally {
  return {
    count: payments.length,
    totalMinor: payments.reduce((sum, payment) => sum + payment.amountMinor, 0),
  };
}

function booked(payments: readonly CopyPaymentRow[]): BookedPaymentsTally {
  const days = payments.map((payment) => payment.bookedOn).sort();
  return { ...tally(payments), bookedFrom: days[0] ?? null };
}

function othersIn(
  entries: readonly CopyAuditRow[],
  accounts: readonly CopyAccountRow[],
): OtherAdministrator[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.adminId, (counts.get(entry.adminId) ?? 0) + 1);
  }
  const names = new Map(accounts.map((account) => [account.donorId, account.name]));
  return [...counts.entries()]
    .map(([adminId, actions]) => ({ adminId, name: names.get(adminId) ?? null, actions }))
    .sort(
      (first, second) =>
        second.actions - first.actions ||
        (first.name === null ? 1 : 0) - (second.name === null ? 1 : 0) ||
        inCzechOrder(first.name ?? '', second.name ?? '') ||
        (first.adminId < second.adminId ? -1 : first.adminId > second.adminId ? 1 : 0),
    );
}
