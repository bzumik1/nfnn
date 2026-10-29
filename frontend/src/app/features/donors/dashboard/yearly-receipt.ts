import { DonationSummaryResponse } from '../../donations/donations-api';

export type YearReceipt = 'available' | 'after-year-end' | 'not-issued';

export function yearReceipt(year: number, summary: DonationSummaryResponse): YearReceipt {
  if (year < summary.receiptsAvailableFrom) {
    return 'not-issued';
  }
  return year > summary.yearlyReceiptsAvailableThrough ? 'after-year-end' : 'available';
}
