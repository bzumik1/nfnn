import { describe, expect, it } from 'vitest';
import { sharedCases } from '../../../../testing/shared-cases';
import { pragueDay } from '../../donations/donation-date';
import { everyOfferedYear, type OverviewRows, yearOverview } from './administration-overview';

function rowsOf(input: Readonly<Record<string, unknown>>): OverviewRows {
  const chunks = input['chunks'] as Readonly<Record<string, readonly unknown[]>>;
  const rowsOfKind = <Row>(kind: string): Row[] =>
    Object.entries(chunks)
      .filter(([id]) => id.startsWith(`donations/${kind}:`))
      .flatMap(([, rows]) => rows as Row[]);
  return {
    payments: rowsOfKind<OverviewRows['payments'][number]>('payments'),
    donations: rowsOfKind<OverviewRows['donations'][number]>('donations'),
    donorRecords: rowsOfKind<OverviewRows['donorRecords'][number]>('donor-records'),
  };
}

for (const sharedCase of sharedCases('admin-overview/year-overview.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    const rows = rowsOf(sharedCase.input);
    const today = pragueDay(sharedCase.input['now'] as string);

    it('when the device compiles the year overview from the chunks of its copy, then it is the overview the server answers', () => {
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
