import type { AdminOverviewResponse, MonthOverviewResponse, TallyResponse } from '../admin-api';
import { pragueDay } from '../../donations/donation-date';
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

const CURRENCY = 'CZK';
const MONTHS_IN_YEAR = 12;

export function offeredYears(rows: OverviewRows, today: string): number[] {
  const years = new Set<number>([yearOf(today)]);
  for (const donation of rows.donations) {
    years.add(yearOf(donation.receivedAt));
  }
  for (const payment of rows.payments) {
    years.add(yearOf(payment.bookedOn));
  }
  return [...years].sort((first, second) => second - first);
}

export function yearOverview(
  rows: OverviewRows,
  today: string,
  requested: number | null,
): AdminOverviewResponse {
  const availableYears = offeredYears(rows, today);
  const year = requested ?? availableYears[0];
  return { ...overviewOf(rows, today, year), availableYears };
}

export function everyOfferedYear(rows: OverviewRows, today: string): YearOverviewOfCopy[] {
  return offeredYears(rows, today).map((year) => overviewOf(rows, today, year));
}

function overviewOf(rows: OverviewRows, today: string, year: number): YearOverviewOfCopy {
  const paired = new Set(rows.donations.flatMap((donation) => donation.paymentId ?? []));
  const received = rows.donations.filter(
    (donation) => donation.status === 'RECEIVED' && yearOf(donation.receivedAt) === year,
  );
  const unpaired = rows.payments.filter(
    (payment) => !paired.has(payment.id) && yearOf(payment.bookedOn) === year,
  );
  const registrationDays = rows.donorRecords.map((record) => pragueDay(record.registeredAt));
  const registeredBefore = (firstDay: string): number =>
    registrationDays.filter((day) => day < firstDay).length;
  const months: MonthOverviewResponse[] = [];
  let started = 0;
  for (let month = 1; month <= MONTHS_IN_YEAR; month++) {
    const key = monthKey(year, month);
    if (`${key}-01` > today) {
      break;
    }
    const ofMonth = received.filter((donation) => donation.receivedAt.startsWith(`${key}-`));
    const monthPaired = tally(ofMonth);
    const monthUnpaired = tally(
      unpaired.filter((payment) => payment.bookedOn.startsWith(`${key}-`)),
    );
    months.unshift({
      month: key,
      received: plus(monthPaired, monthUnpaired),
      newDonors: registeredBefore(nextMonthStart(year, month)) - registeredBefore(`${key}-01`),
      givingDonors: distinctDonors(ofMonth),
      paired: monthPaired,
      unpaired: monthUnpaired,
    });
    started = month;
  }
  const registeredAtStart = registeredBefore(`${monthKey(year, 1)}-01`);
  const registered =
    started === 0 ? registeredAtStart : registeredBefore(nextMonthStart(year, started));
  const yearPaired = tally(received);
  const yearUnpaired = tally(unpaired);
  return {
    year,
    donorsRegistered: registered,
    newDonors: registered - registeredAtStart,
    givingDonors: distinctDonors(received),
    received: plus(yearPaired, yearUnpaired),
    paired: yearPaired,
    unpaired: yearUnpaired,
    months,
  };
}

function tally(rows: readonly { readonly amountMinor: number }[]): TallyResponse {
  return {
    count: rows.length,
    totalMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0),
    currency: CURRENCY,
  };
}

function plus(first: TallyResponse, second: TallyResponse): TallyResponse {
  return {
    count: first.count + second.count,
    totalMinor: first.totalMinor + second.totalMinor,
    currency: CURRENCY,
  };
}

function distinctDonors(donations: readonly { readonly donorId: string }[]): number {
  return new Set(donations.map((donation) => donation.donorId)).size;
}

function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

function monthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function nextMonthStart(year: number, month: number): string {
  return month === MONTHS_IN_YEAR
    ? `${monthKey(year + 1, 1)}-01`
    : `${monthKey(year, month + 1)}-01`;
}
