import { describe, expect, it } from 'vitest';
import { sharedCases } from '../../../../testing/shared-cases';
import { pragueDay } from '../../donations/donation-date';
import { everyOfferedYear, type OverviewRows, yearOverview } from './administration-overview';

interface CaseDonor {
  readonly alias: string;
  readonly registeredAt: string;
}

interface CasePayment {
  readonly alias: string;
  readonly bookedOn: string;
  readonly amountMinor: number;
}

interface CaseDonation {
  readonly donor: string;
  readonly payment?: string | null;
  readonly receivedOn: string;
  readonly amountMinor: number;
  readonly status: 'RECEIVED' | 'REFUNDED';
}

function rowsOf(input: Readonly<Record<string, unknown>>): OverviewRows {
  const donors = input['donors'] as readonly CaseDonor[];
  const payments = input['payments'] as readonly CasePayment[];
  const donations = input['donations'] as readonly CaseDonation[];
  return {
    donorRecords: donors.map((donor) => ({ registeredAt: donor.registeredAt })),
    payments: payments.map((payment) => ({
      id: `payment:${payment.alias}`,
      bookedOn: payment.bookedOn,
      amountMinor: payment.amountMinor,
    })),
    donations: donations.map((donation) => ({
      donorId: `donor:${donation.donor}`,
      paymentId: donation.payment ? `payment:${donation.payment}` : null,
      receivedAt: donation.receivedOn,
      amountMinor: donation.amountMinor,
      status: donation.status,
    })),
  };
}

for (const sharedCase of sharedCases('admin-overview/year-overview.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    const rows = rowsOf(sharedCase.input);
    const today = pragueDay(sharedCase.input['now'] as string);

    it('when the device compiles the year overview from its copy, then it is the overview the server answers', () => {
      expect(yearOverview(rows, today, sharedCase.input['year'] as number | null)).toEqual(
        sharedCase.expected,
      );
    });

    it('when the device compiles every offered year, then the asked year is among them exactly when the server offers it', () => {
      const expected = sharedCase.expected as { year: number; availableYears: number[] };
      const years = everyOfferedYear(rows, today);
      const { availableYears, ...ofTheYear } = sharedCase.expected as Record<string, unknown>;

      expect(years.map((entry) => entry.year)).toEqual(availableYears);
      expect(years.find((entry) => entry.year === expected.year) ?? null).toEqual(
        expected.availableYears.includes(expected.year) ? ofTheYear : null,
      );
    });
  });
}
