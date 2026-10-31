import { sharedCases } from '../../../testing/shared-cases';
import {
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptDonor,
  receiptDisplay,
} from './receipt-format';
import type { SignedReceipt } from './verification/receipt-proof';

const FORMATTING = sharedCases('receipts/formatting.json');

describe('Given the shared receipt formatting cases of donors', () => {
  const donors = FORMATTING.flatMap((sharedCase) =>
    sharedCase.input.format === 'donor' && 'donor' in sharedCase.expected
      ? [{ name: sharedCase.name, input: sharedCase.input, expected: sharedCase.expected.donor }]
      : [],
  );

  it('when they are read, then there are some to run', () => {
    expect(donors.length).toBeGreaterThan(0);
  });

  for (const donor of donors) {
    it(`when ${donor.name} is formatted, then name, identifier and address read as the receipt prints them`, () => {
      expect(formatReceiptDonor(donor.input)).toEqual(donor.expected);
    });
  }
});

describe('Given the shared receipt formatting cases of Czech amounts', () => {
  const amounts = FORMATTING.flatMap((sharedCase) =>
    sharedCase.input.format === 'czechAmount' && 'text' in sharedCase.expected
      ? [
          {
            name: sharedCase.name,
            minor: sharedCase.input.amountMinor,
            text: sharedCase.expected.text,
          },
        ]
      : [],
  );

  for (const amount of amounts) {
    it(`when ${amount.name} are formatted, then they read as the receipt prints them`, () => {
      expect(formatReceiptAmount(amount.minor)).toBe(amount.text);
    });
  }
});

describe('Given a receipt date', () => {
  it('when it is formatted, then it has two-digit day and month as everywhere on the site (plan v3 D11)', () => {
    expect(formatReceiptDate('2026-03-05')).toBe('05. 03. 2026');
  });
});

const YEARLY: SignedReceipt = {
  kind: 'yearly',
  number: '2027-000012',
  issuedOn: '2027-01-15',
  year: 2026,
  replaces: { number: '2026-000044', issuedOn: '2026-12-20' },
  donor: {
    type: 'company',
    name: 'Acme Třebíč s.r.o.',
    street: 'Průmyslová 5',
    city: 'Česká Lípa',
    postalCode: '470 01',
    companyIdentifier: '25596641',
  },
  gifts: [
    { receivedOn: '2026-02-03', amountMinor: 50000 },
    { receivedOn: '2026-11-30', amountMinor: 125050 },
  ],
  totalMinor: 175050,
};

describe('Given a signed yearly receipt of a company that replaces an earlier one', () => {
  it('when it is prepared for display, then every value reads as on paper', () => {
    expect(receiptDisplay(YEARLY)).toEqual({
      number: '2027-000012',
      issuedOn: '15. 01. 2027',
      replaces: { number: '2026-000044', issuedOn: '20. 12. 2026' },
      company: true,
      donorName: 'Acme Třebíč s.r.o.',
      donorIdentifier: '25596641',
      donorAddress: 'Průmyslová 5, 470 01 Česká Lípa',
      year: 2026,
      gifts: [
        { receivedOn: '03. 02. 2026', amount: '500 Kč' },
        { receivedOn: '30. 11. 2026', amount: '1 250,50 Kč' },
      ],
      total: '1 750,50 Kč',
    });
  });
});

describe('Given a signed single receipt of a person', () => {
  it('when it is prepared for display, then it names no year and no identifier', () => {
    const display = receiptDisplay({
      ...YEARLY,
      kind: 'single',
      year: null,
      replaces: null,
      donor: { ...YEARLY.donor, type: 'person', companyIdentifier: null },
      gifts: [YEARLY.gifts[0]],
      totalMinor: 50000,
    });

    expect(display.year).toBeNull();
    expect(display.replaces).toBeNull();
    expect(display.company).toBe(false);
    expect(display.donorIdentifier).toBeNull();
    expect(display.gifts).toEqual([{ receivedOn: '03. 02. 2026', amount: '500 Kč' }]);
  });
});
