import type { AdminOverviewResponse } from '../admin-api';
import type { CopyDonationRow, CopyDonorRecordRow, CopyPaymentRow } from './administration-views';

export type YearOverviewOfCopy = Omit<AdminOverviewResponse, 'availableYears'>;

export interface OverviewRows {
  readonly payments: readonly Pick<CopyPaymentRow, 'id' | 'bookedOn' | 'amountMinor'>[];
  readonly donations: readonly Pick<
    CopyDonationRow,
    'donorId' | 'paymentId' | 'receivedAt' | 'amountMinor' | 'status'
  >[];
  readonly donorRecords: readonly Pick<CopyDonorRecordRow, 'registeredAt'>[];
}

export function offeredYears(rows: OverviewRows, today: string): number[] {
  return rows === null ? [] : [Number(today.slice(0, 4))];
}

export function yearOverview(
  rows: OverviewRows,
  today: string,
  requested: number | null,
): AdminOverviewResponse {
  throw new Error(`Not computed yet: ${requested ?? offeredYears(rows, today)[0]}`);
}

export function everyOfferedYear(rows: OverviewRows, today: string): YearOverviewOfCopy[] {
  return offeredYears(rows, today).length === 0 ? [] : [];
}
