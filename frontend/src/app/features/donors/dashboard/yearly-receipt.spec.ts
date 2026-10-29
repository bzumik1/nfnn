import { twoYearSummary } from '../../donations/testing/donation-fixtures';
import { yearReceipt } from './yearly-receipt';

describe('Given the summary of the donations', () => {
  const summary = {
    ...twoYearSummary(),
    receiptsAvailableFrom: 2025,
    yearlyReceiptsAvailableThrough: 2025,
  };

  it('when a year the API counts as completed is asked about, then its yearly receipt is available', () => {
    expect(yearReceipt(2025, summary)).toBe('available');
  });

  it('when a later year is asked about, then its receipt comes after the year ends whatever the clock says', () => {
    expect(yearReceipt(2026, summary)).toBe('after-year-end');
    expect(yearReceipt(2026, { ...summary, yearlyReceiptsAvailableThrough: 2026 })).toBe(
      'available',
    );
  });

  it('when a year before the first receipt year is asked about, then no receipt is issued for it', () => {
    expect(yearReceipt(2024, summary)).toBe('not-issued');
  });
});
