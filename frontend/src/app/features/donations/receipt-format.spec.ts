import { sharedCases } from '../../../testing/shared-cases';
import {
  fillReceiptText,
  formatReceiptAmount,
  formatReceiptAmountEn,
  formatReceiptDate,
  formatReceiptDateEn,
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

function casesOf(format: string): { name: string; value: string | number; text: string }[] {
  return FORMATTING.flatMap((sharedCase) => {
    const input = sharedCase.input as { format: string; amountMinor?: number; date?: string };
    if (input.format !== format || !('text' in sharedCase.expected)) {
      return [];
    }
    return [
      {
        name: sharedCase.name,
        value: input.amountMinor ?? input.date ?? '',
        text: sharedCase.expected.text,
      },
    ];
  });
}

describe('Given the shared receipt formatting cases of English amounts', () => {
  const amounts = casesOf('englishAmount');

  it('when they are read, then there are some to run', () => {
    expect(amounts.length).toBeGreaterThan(0);
  });

  for (const amount of amounts) {
    it(`when ${amount.name} are formatted, then they read as the bilingual receipt prints them`, () => {
      expect(formatReceiptAmountEn(Number(amount.value))).toBe(amount.text);
    });
  }
});

describe('Given the shared receipt formatting cases of English dates', () => {
  const dates = casesOf('englishDate');

  it('when they are read, then there are some to run', () => {
    expect(dates.length).toBeGreaterThan(0);
  });

  for (const date of dates) {
    it(`when ${date.name} is formatted, then it reads as the bilingual receipt prints it`, () => {
      expect(formatReceiptDateEn(String(date.value))).toBe(date.text);
    });
  }
});

describe('Given the shared receipt formatting cases of Czech dates', () => {
  const dates = casesOf('czechDate');

  for (const date of dates) {
    it(`when ${date.name} is formatted, then it reads as v2 printed it with two-digit day and month (plan v3 D11, the listed difference)`, () => {
      const padded = date.text.replace(
        /^(\d{1,2})\. (\d{1,2})\. /,
        (_, day: string, month: string) => `${day.padStart(2, '0')}. ${month.padStart(2, '0')}. `,
      );
      expect(formatReceiptDate(String(date.value))).toBe(padded);
    });
  }
});

describe('Given a receipt text with numbered placeholders', () => {
  it('when it is filled, then each placeholder takes its value, as often as it appears', () => {
    expect(fillReceiptText('{0}, dne {1}; {0}', 'V Novém Boru', '15. 03. 2026')).toBe(
      'V Novém Boru, dne 15. 03. 2026; V Novém Boru',
    );
  });

  it('when a value holds braces or a dollar sign, then it is written as it is', () => {
    expect(fillReceiptText('Jméno: {0}', '{1} $& Nováková')).toBe('Jméno: {1} $& Nováková');
  });

  it('when it quotes with apostrophes as the server bundle may, then two apostrophes write one and a quoted part stays literal', () => {
    expect(fillReceiptText("the foundation''s '{0}' {0}", 'X')).toBe("the foundation's {0} X");
  });

  it('when a placeholder has no value, then it is refused rather than printed', () => {
    expect(() => fillReceiptText('{0} {1}', 'only one')).toThrow();
  });
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
