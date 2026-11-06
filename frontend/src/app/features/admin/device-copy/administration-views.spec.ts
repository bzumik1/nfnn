import { describe, expect, it } from 'vitest';
import { type AdministrationCopyInput, sharedCases } from '../../../../testing/shared-cases';
import {
  accountSearch,
  type CopyAccountRow,
  donorCard,
  donorRecordSearch,
  type DonationsCopyRows,
  foldAccents,
  paymentList,
} from './administration-views';

describe('Given the shared cases of the payment list', () => {
  for (const sharedCase of sharedCases('admin-payments/list.json')) {
    it(`when the device lists the payments of ${sharedCase.name} from its copy, then every answer is the case's`, () => {
      const rows = donationsRows(sharedCase.input);
      const answers = sharedCase.input.queries.map((query) =>
        paymentList(rows, query.pairing ?? 'unpaired', {
          text: query.query,
          from: query.from,
          to: query.to,
          donorId: query.donor === undefined ? undefined : `donor:${query.donor}`,
          offset: query.offset,
          limit: query.limit,
          year: query.year,
        }),
      );

      expect(answers).toEqual(sharedCase.expected.answers);
    });
  }
});

describe('Given the shared cases of the donor record search', () => {
  for (const sharedCase of sharedCases('admin-donors/record-search.json')) {
    it(`when the device searches the donor records of ${sharedCase.name} from its copy, then every answer is the case's`, () => {
      const rows = donationsRows(sharedCase.input);
      const answers = sharedCase.input.queries.map((query) =>
        donorRecordSearch(rows.donorRecords, query.query),
      );

      expect(answers).toEqual(sharedCase.expected.answers);
    });
  }
});

describe('Given the shared cases of the account search', () => {
  for (const sharedCase of sharedCases('admin-donors/account-search.json')) {
    it(`when the device searches the accounts of ${sharedCase.name} from its copy, then every answer is the case's`, () => {
      const accounts = rowsOf<CopyAccountRow>(sharedCase.input, 'donors/accounts');
      const answers = sharedCase.input.queries.map((query) =>
        accountSearch(accounts, query.query ?? '', query.page, query.limit),
      );

      expect(answers).toEqual(sharedCase.expected.answers);
    });
  }
});

describe('Given the shared cases of the donor card', () => {
  for (const sharedCase of sharedCases('admin-donors/donor-card.json')) {
    it(`when the device opens the donor cards of ${sharedCase.name} from its copy, then every card is the case's`, () => {
      const rows = donationsRows(sharedCase.input);
      const summary = sharedCase.input.summary;
      if (summary === undefined) {
        throw new Error('A donor card case names the summary');
      }
      const answers = sharedCase.input.queries.map((query) =>
        donorCard(rows, `donor:${query.donor}`, summary),
      );

      expect(answers).toEqual(sharedCase.expected.answers);
    });
  }
});

describe('Given a donor card of a donor the copy does not hold', () => {
  it('when the device opens it, then it gives none, so the page asks the server', () => {
    const rows = donationsRows({ chunks: {}, queries: [] });

    expect(
      donorCard(rows, 'donor:nobody', { today: '2026-10-20', receiptsAvailableFrom: 2026 }),
    ).toBeNull();
  });
});

describe('Given receipts of a donor in the copy', () => {
  const rows: DonationsCopyRows = {
    ...donationsRows({ chunks: {}, queries: [] }),
    donorRecords: [
      {
        donorId: 'jana',
        name: 'Jana Nováková',
        type: 'PERSON',
        variableSymbol: '7700001001',
        companyIdentifier: null,
        address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
        preferredLocale: 'cs',
        registeredAt: '2026-01-15T10:00:00Z',
        erasedAt: null,
      },
    ],
    donations: [
      {
        id: 'gift',
        donorId: 'jana',
        paymentId: null,
        receivedAt: '2026-03-01',
        amountMinor: 5000,
        currency: 'CZK',
        status: 'RECEIVED',
        source: 'MANUAL',
        purpose: 'GENERAL',
        pairedBy: null,
        bankAccountId: null,
        symbolClaimId: null,
        recordedAt: '2026-03-01T12:00:00Z',
      },
    ],
    receipts: [
      receipt({
        id: 'older',
        number: '2026-000001',
        status: 'REPLACED',
        issuedAt: '2026-03-02T10:00:00Z',
      }),
      receipt({
        id: 'newer',
        number: '2026-000002',
        status: 'ACTIVE',
        issuedAt: '2026-03-05T10:00:00Z',
      }),
      receipt({
        id: 'other',
        number: '2026-000003',
        status: 'ACTIVE',
        issuedAt: '2026-03-06T10:00:00Z',
        donorId: 'petr',
      }),
    ],
  };

  it("when the device opens the donor card, then the gift names its active receipt and the card lists the donor's receipts newest first with the key and the gift's day", () => {
    const card = donorCard(rows, 'jana', { today: '2026-10-20', receiptsAvailableFrom: 2026 });

    expect(card?.donations.items[0].receiptNumber).toBe('2026-000002');
    expect(
      card?.receipts.map((item) => [item.number, item.active, item.keyId, item.donationReceivedOn]),
    ).toEqual([
      ['2026-000002', true, 'key-1', '2026-03-01'],
      ['2026-000001', false, 'key-1', '2026-03-01'],
    ]);
  });

  it('when the device lists the paired payments, then a gift with any receipt says a receipt was issued', () => {
    const paired = paymentList(
      {
        ...rows,
        payments: [
          {
            id: 'payment',
            version: '0123456789abcdef',
            bankTransactionId: 1,
            bookedOn: '2026-03-01',
            amountMinor: 5000,
            currency: 'CZK',
            variableSymbol: null,
            counterpartyAccount: null,
            counterpartyName: null,
            messageForRecipient: null,
            importedAt: '2026-03-01T12:00:00Z',
            unpairedByAdminAt: null,
            accountVerification: false,
          },
        ],
        donations: [
          {
            ...rows.donations[0],
            paymentId: 'payment',
            pairedBy: 'MANUAL',
            source: 'BANK_TRANSFER',
          },
        ],
      },
      'paired',
      {},
    );

    expect(paired.items[0].donation?.receiptIssued).toBe(true);
  });
});

describe('Given text with Czech letters', () => {
  it('when it is folded for a search, then the Czech accented letters become plain and the text lower case', () => {
    expect(foldAccents('Žluťoučký KŮŇ Ďábel')).toBe('zlutoucky kun dabel');
  });
});

function receipt(fields: {
  readonly id: string;
  readonly number: string;
  readonly status: 'ACTIVE' | 'REPLACED' | 'WITHDRAWN';
  readonly issuedAt: string;
  readonly donorId?: string;
}): DonationsCopyRows['receipts'][number] {
  return {
    id: fields.id,
    donorId: fields.donorId ?? 'jana',
    status: fields.status,
    kind: 'SINGLE',
    number: fields.number,
    donationId: 'gift',
    year: null,
    issuedOn: fields.issuedAt.slice(0, 10),
    issuedAt: fields.issuedAt,
    withdrawnAt: null,
    withdrawalReason: null,
    locale: 'cs',
    keyId: 'key-1',
  };
}

function donationsRows(input: AdministrationCopyInput<unknown>): DonationsCopyRows {
  return {
    payments: rowsOf(input, 'donations/payments'),
    donations: rowsOf(input, 'donations/donations'),
    donorRecords: rowsOf(input, 'donations/donor-records'),
    links: rowsOf(input, 'donations/links'),
    symbolClaims: rowsOf(input, 'donations/symbol-claims'),
    receipts: rowsOf(input, 'donations/receipts'),
  };
}

function rowsOf<Row>(input: AdministrationCopyInput<unknown>, kind: string): Row[] {
  return Object.keys(input.chunks)
    .filter((id) => id === kind || id.startsWith(`${kind}:`))
    .sort()
    .flatMap((id) => input.chunks[id] as Row[]);
}
