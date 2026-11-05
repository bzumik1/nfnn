import type { CopyContents, StoredChunk } from '../../../core/device/store/account-store';
import { sharedCases } from '../../../../testing/shared-cases';
import type { IssuedReceipt } from '../receipt-pdf/frozen-receipt';
import {
  activeReceiptOf,
  type DonationRow,
  donorCopyView,
  imageDigestsOf,
  summarizeDonations,
  type SummarizedDonation,
} from './donor-copy-view';

const FIGURES = ['totalAmountMinor', 'currency', 'count', 'lastReceivedAt', 'byYear'] as const;

const SUMMARY = {
  totalAmountMinor: 60_100,
  currency: 'CZK',
  count: 3,
  lastReceivedAt: '2026-05-05',
  byYear: [
    { year: 2026, count: 2, totalAmountMinor: 50_100 },
    { year: 2025, count: 1, totalAmountMinor: 10_000 },
  ],
  yearlyReceiptsAvailableThrough: 2025,
  receiptsAvailableFrom: 2026,
  bankDataAsOf: '2026-10-20T09:00:00Z',
};

function donation(overrides: Partial<DonationRow> = {}): DonationRow {
  return {
    id: 'donation:1',
    receivedAt: '2026-03-15',
    amountMinor: 50_000,
    currency: 'CZK',
    status: 'RECEIVED',
    source: 'BANK_TRANSFER',
    purpose: 'GENERAL',
    pairedBy: 'VARIABLE_SYMBOL',
    bankAccountId: null,
    symbolClaimId: null,
    ...overrides,
  };
}

function receipt(overrides: Partial<IssuedReceipt> = {}): IssuedReceipt {
  return {
    id: 'receipt:1',
    status: 'ACTIVE',
    kind: 'SINGLE',
    number: '000001',
    donationId: 'donation:2',
    year: null,
    issuedAt: '2026-05-06T08:00:00Z',
    supersededAt: null,
    receipt: {
      signatory: {
        name: 'Josef Vzorový',
        role: 'předseda správní rady',
        signatureImage: { sha256: 'a'.repeat(64) },
        portraitImage: { sha256: 'b'.repeat(64) },
      },
    } as unknown as IssuedReceipt['receipt'],
    ...overrides,
  };
}

function chunk(id: string, rows: readonly unknown[]): StoredChunk {
  return { id, rowsSha256: '0'.repeat(64), rows };
}

function copy(chunks: readonly StoredChunk[], summary: unknown = SUMMARY): CopyContents {
  return { chunks, summary, storedAt: '2026-10-20T10:00:00Z' };
}

function figuresOf(summary: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(FIGURES.map((field) => [field, summary[field]]));
}

interface CaseDonation extends SummarizedDonation {
  readonly donor: string;
  readonly receivedOn: string;
}

describe('Given the donor summary computed in the browser', () => {
  for (const sharedCase of sharedCases('donor-summary/summary.json')) {
    describe(`Given the shared case ${sharedCase.name}`, () => {
      it('when the donor’s gifts are summarized, then the figures are those the server answers', () => {
        const donations = (sharedCase.input['donations'] as readonly CaseDonation[])
          .filter((row) => row.donor === sharedCase.input['donor'])
          .map((row) => ({ ...row, receivedAt: row.receivedOn }));

        expect(summarizeDonations(donations)).toEqual(figuresOf(sharedCase.expected));
      });
    });
  }

  for (const sharedCase of sharedCases('sync/manifest.json')) {
    describe(`Given the shared case ${sharedCase.name}`, () => {
      it('when the copy holds the chunks of its manifest, then its view shows the manifest’s summary and agrees with it', () => {
        const view = donorCopyView(copy(sharedCase.expected.chunks, sharedCase.expected.summary));

        expect(view?.summary).toEqual(sharedCase.expected.summary);
        expect(view?.agrees).toBe(true);
        expect(
          summarizeDonations(sharedCase.expected.chunks.flatMap((entry) => entry.rows) as never),
        ).toEqual(figuresOf(sharedCase.expected.summary));
      });

      it('when the copy holds the chunks of its manifest, then its gifts come newest year first, in the order each chunk was served', () => {
        const view = donorCopyView(copy(sharedCase.expected.chunks, sharedCase.expected.summary));
        const served = [...sharedCase.expected.chunks]
          .filter((entry) => entry.id.startsWith('donations:'))
          .sort((first, second) => second.id.localeCompare(first.id))
          .flatMap((entry) => entry.rows.map((row) => row['id']));

        expect(view?.items.map((item) => item.id)).toEqual(served);
      });
    });
  }
});

describe('Given a copy of the donor’s data', () => {
  it('when it holds no summary of the donor, as an erased donor’s copy, then it has no view', () => {
    expect(donorCopyView(copy([], {}))).toBeNull();
    expect(donorCopyView(null)).toBeNull();
  });

  it('when the gifts are shown, then each carries the text of its purpose, its account, its confirmed symbol and its receipt as the server lists it', () => {
    const view = donorCopyView(
      copy([
        chunk('bank-accounts', [{ id: 'account:1', accountNumber: '2900233333/2010' }]),
        chunk('donations:2026', [
          donation({
            id: 'donation:2',
            receivedAt: '2026-05-05',
            amountMinor: 100,
            purpose: 'ACCOUNT_VERIFICATION',
            pairedBy: 'SENDER_ACCOUNT',
            bankAccountId: 'account:1',
          }),
          donation({
            id: 'donation:1',
            pairedBy: 'CONFIRMED_SYMBOL',
            symbolClaimId: 'claim:1',
          }),
        ]),
        chunk('donations:2025', [donation({ id: 'donation:0', receivedAt: '2025-01-01' })]),
        chunk('receipts:2026', [receipt({ donationId: 'donation:1', number: '000007' })]),
        chunk('symbol-claims', [
          {
            id: 'claim:1',
            accountNumber: '2900233333/2010',
            variableSymbol: '1234567890',
            answer: 'CONFIRMED',
          },
        ]),
      ]),
    );

    expect(view?.items).toEqual([
      expect.objectContaining({
        id: 'donation:2',
        purpose: 'Ověření účtu',
        accountVerification: true,
        senderAccount: '2900233333/2010',
        receiptAvailable: false,
        receiptNumber: null,
      }),
      expect.objectContaining({
        id: 'donation:1',
        purpose: 'Obecný příspěvek',
        accountVerification: false,
        confirmedSymbol: '1234567890',
        receiptAvailable: true,
        receiptNumber: '000007',
      }),
      expect.objectContaining({ id: 'donation:0', receiptAvailable: false }),
    ]);
  });

  it('when a gift names an account or a symbol no stored chunk holds yet, then it is shown without them', () => {
    const view = donorCopyView(
      copy([
        chunk('donations:2026', [
          donation({ bankAccountId: 'account:9', symbolClaimId: 'claim:9' }),
        ]),
      ]),
    );

    expect(view?.items[0]).toEqual(
      expect.objectContaining({ senderAccount: null, confirmedSymbol: null }),
    );
  });

  it('when a refunded gift had a receipt, then it shows no receipt number', () => {
    const view = donorCopyView(
      copy([
        chunk('donations:2026', [donation({ status: 'REFUNDED' })]),
        chunk('receipts:2026', [receipt({ donationId: 'donation:1' })]),
      ]),
    );

    expect(view?.items[0]).toEqual(
      expect.objectContaining({ receiptNumber: null, receiptAvailable: false }),
    );
  });

  it('when a replaced or withdrawn single receipt is kept, then the gift shows only its active receipt', () => {
    const view = donorCopyView(
      copy([
        chunk('donations:2026', [donation()]),
        chunk('receipts:2026', [
          receipt({ id: 'receipt:1', donationId: 'donation:1', status: 'REPLACED' }),
          receipt({ id: 'receipt:2', donationId: 'donation:1', status: 'WITHDRAWN' }),
        ]),
      ]),
    );

    expect(view?.items[0].receiptNumber).toBeNull();
  });

  it('when its gifts give other figures than its summary, then the view says it does not agree', () => {
    const view = donorCopyView(copy([chunk('donations:2026', [donation()])]));

    expect(view?.agrees).toBe(false);
    expect(view?.summary).toEqual(SUMMARY);
  });

  it('when a receipt is asked for, then only the active one of that year or gift is found', () => {
    const view = donorCopyView(
      copy([
        chunk('receipts:2025', [
          receipt({
            id: 'yearly-old',
            kind: 'YEARLY',
            year: 2025,
            donationId: null,
            status: 'REPLACED',
          }),
          receipt({ id: 'yearly', kind: 'YEARLY', year: 2025, donationId: null }),
        ]),
        chunk('receipts:2026', [receipt({ id: 'single', donationId: 'donation:2' })]),
      ]),
    )!;

    expect(activeReceiptOf(view, { year: 2025 })?.id).toBe('yearly');
    expect(activeReceiptOf(view, { year: 2024 })).toBeNull();
    expect(activeReceiptOf(view, { donationId: 'donation:2' })?.id).toBe('single');
    expect(activeReceiptOf(view, { donationId: 'donation:3' })).toBeNull();
  });

  it('when the images to keep are listed, then they are the signatures and portraits of the active receipts, each once', () => {
    expect(
      imageDigestsOf([
        receipt(),
        receipt({ id: 'receipt:2' }),
        receipt({
          id: 'receipt:3',
          status: 'REPLACED',
          receipt: {
            signatory: { signatureImage: { sha256: 'c'.repeat(64) } },
          } as unknown as IssuedReceipt['receipt'],
        }),
      ]),
    ).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
  });
});
