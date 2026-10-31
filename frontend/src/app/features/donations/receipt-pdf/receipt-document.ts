import {
  fillReceiptText,
  formatReceiptAmount,
  formatReceiptAmountEn,
  formatReceiptDate,
  formatReceiptDateEn,
} from '../receipt-format';
import { FrozenReceipt } from './frozen-receipt';
import { printedText } from './receipt-characters';

export interface Bilingual {
  readonly cs: string;
  readonly en: string | null;
}

export interface ReceiptParty {
  readonly heading: Bilingual;
  readonly lines: readonly Bilingual[];
}

export interface ReceiptGiftRow {
  readonly receivedOn: Bilingual;
  readonly amount: Bilingual;
}

export interface ReceiptGiftTable {
  readonly account: Bilingual;
  readonly columns: { readonly receivedOn: Bilingual; readonly amount: Bilingual };
  readonly rows: readonly ReceiptGiftRow[];
  readonly count: Bilingual;
  readonly total: Bilingual;
}

export interface ReceiptSignatureBlock {
  readonly issuedAt: Bilingual;
  readonly forFoundation: Bilingual;
  readonly name: string;
  readonly role: string;
  readonly signatureImage: string | null;
  readonly portraitImage: string | null;
  readonly signatureAlt: string;
  readonly portraitAlt: string;
}

export interface ReceiptVerificationBlock {
  readonly qrText: string;
  readonly heading: Bilingual;
  readonly text: Bilingual;
  readonly alt: string;
}

export interface ReceiptDocument {
  readonly bilingual: boolean;
  readonly number: string;
  readonly issuedAt: string;
  readonly fileName: string;
  readonly author: string;
  readonly logoAlt: string;
  readonly title: Bilingual;
  readonly numberLine: Bilingual;
  readonly issuedOnLine: Bilingual;
  readonly replaces: Bilingual | null;
  readonly donee: ReceiptParty;
  readonly donor: ReceiptParty;
  readonly singleGift: readonly Bilingual[] | null;
  readonly giftTable: ReceiptGiftTable | null;
  readonly declaration: Bilingual;
  readonly signature: ReceiptSignatureBlock;
  readonly verification: ReceiptVerificationBlock;
  readonly footer: string;
}

export class ReceiptUnprintable extends Error {
  constructor(readonly outside: readonly number[]) {
    super(
      `The frozen receipt holds characters no receipt can print: ${outside
        .map((codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`)
        .join(', ')}.`,
    );
  }
}

export interface ReceiptCaptions {
  readonly verificationHeading: Bilingual;
  readonly verificationText: Bilingual;
  readonly verificationAlt: string;
  readonly signatureAlt: string;
  readonly portraitAlt: string;
}

type ReceiptTexts = Readonly<Record<string, string>>;

interface Texts {
  readonly bilingual: boolean;
  line(key: string, cs: readonly string[], en?: readonly string[]): Bilingual;
  frozenOr(key: string, fallback: Bilingual): Bilingual;
  frozenCzechOr(key: string, fallback: string): string;
}

function textsOf(receipt: FrozenReceipt): Texts {
  const english: ReceiptTexts | null = receipt.locale === 'en' ? receipt.texts.en : null;
  const text = (texts: ReceiptTexts, key: string, values: readonly string[]): string => {
    const template = texts[key];
    if (template === undefined) {
      throw new Error(`The frozen receipt has no text ${key}.`);
    }
    return fillReceiptText(template, ...values);
  };
  const frozen = (texts: ReceiptTexts | null, key: string): string | undefined =>
    texts === null ? undefined : texts[key];
  return {
    bilingual: english !== null,
    line: (key, cs, en = cs) => ({
      cs: text(receipt.texts.cs, key, cs),
      en: english === null ? null : text(english, key, en),
    }),
    frozenOr: (key, fallback) => ({
      cs: frozen(receipt.texts.cs, key) ?? fallback.cs,
      en: english === null ? null : (frozen(english, key) ?? fallback.en),
    }),
    frozenCzechOr: (key, fallback) => frozen(receipt.texts.cs, key) ?? fallback,
  };
}

function singleLine(address: FrozenReceipt['donor']['address']): string {
  return `${address.street.trim()}, ${address.postalCode.trim()} ${address.city.trim()}`;
}

function fileNameOf(receipt: FrozenReceipt): string {
  const english = receipt.locale === 'en';
  if (receipt.kind === 'SINGLE') {
    return english
      ? `donation-receipt-${receipt.number}.pdf`
      : `potvrzeni-o-daru-${receipt.number}.pdf`;
  }
  return english
    ? `donation-summary-${receipt.year}.pdf`
    : `potvrzeni-o-darech-${receipt.year}.pdf`;
}

function donorLines(receipt: FrozenReceipt, texts: Texts): Bilingual[] {
  const donor = receipt.donor;
  const address = singleLine(donor.address);
  const symbol = texts.line('receipt.donor.variableSymbol', [donor.variableSymbol]);
  if (donor.type === 'COMPANY') {
    return [
      texts.line('receipt.donor.company.name', [donor.name.trim()]),
      texts.line('receipt.donor.company.identifier', [donor.companyIdentifier ?? '']),
      texts.line('receipt.donor.company.seat', [address]),
      symbol,
    ];
  }
  return [
    texts.line('receipt.donor.person.name', [donor.name.trim()]),
    texts.line('receipt.donor.person.residence', [address]),
    symbol,
  ];
}

function bracketed(value: string): string {
  return `(${value})`;
}

function printed<T>(value: T, outside: Set<number>): T {
  if (typeof value === 'string') {
    const text = printedText(value);
    text.outside.forEach((codePoint) => outside.add(codePoint));
    return text.text as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => printed(item, outside)) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, printed(item, outside)]),
    ) as T;
  }
  return value;
}

export function receiptDocument(
  frozen: FrozenReceipt,
  issuedAt: string,
  captions: ReceiptCaptions,
): ReceiptDocument {
  const outside = new Set<number>();
  const receipt = printed(frozen, outside);
  if (outside.size > 0) {
    throw new ReceiptUnprintable([...outside]);
  }
  const texts = textsOf(receipt);
  const foundation = receipt.foundation;
  const foundationAddress = singleLine(foundation.address);
  const year = receipt.year === null ? '' : String(receipt.year);
  const single = receipt.kind === 'SINGLE';
  const first = receipt.gifts[0];
  const totalCs = formatReceiptAmount(receipt.total.amountMinor);
  const totalEn = formatReceiptAmountEn(receipt.total.amountMinor);
  const receivedOnCs = formatReceiptDate(first.receivedOn);
  const receivedOnEn = formatReceiptDateEn(first.receivedOn);
  const issuedOnCs = formatReceiptDate(receipt.issuedOn);
  const issuedOnEn = formatReceiptDateEn(receipt.issuedOn);
  const account = texts.line('receipt.gift.account', [foundation.bankAccountNumber]);
  return {
    bilingual: texts.bilingual,
    number: receipt.number,
    issuedAt,
    fileName: fileNameOf(receipt),
    author: foundation.name,
    logoAlt: foundation.name,
    title: single
      ? texts.line('receipt.title.single', [])
      : texts.line('receipt.title.yearly', [year]),
    numberLine: texts.line('receipt.number', [receipt.number]),
    issuedOnLine: texts.line('receipt.issuedOn', [issuedOnCs], [issuedOnEn]),
    replaces:
      receipt.replaces === null
        ? null
        : texts.line(
            'receipt.replaces',
            [receipt.replaces.number, formatReceiptDate(receipt.replaces.issuedOn)],
            [receipt.replaces.number, formatReceiptDateEn(receipt.replaces.issuedOn)],
          ),
    donee: {
      heading: texts.line('receipt.donee', []),
      lines: [
        texts.line('receipt.donee.name', [foundation.name]),
        texts.line('receipt.donee.companyIdentifier', [foundation.companyIdentifier]),
        texts.line('receipt.donee.seat', [foundationAddress]),
        texts.line('receipt.donee.registry', [foundation.registryFile, foundation.registryCourt]),
      ],
    },
    donor: { heading: texts.line('receipt.donor', []), lines: donorLines(receipt, texts) },
    singleGift: single
      ? [
          texts.line(`receipt.gift.form.${first.source}`, []),
          texts.line('receipt.gift.receivedOn', [receivedOnCs], [receivedOnEn]),
          texts.line('receipt.gift.amount', [totalCs], [totalEn]),
          account,
        ]
      : null,
    giftTable: single
      ? null
      : {
          account,
          columns: {
            receivedOn: texts.line('receipt.table.receivedOn', []),
            amount: texts.line('receipt.table.amount', []),
          },
          rows: receipt.gifts.map((gift) => ({
            receivedOn: {
              cs: formatReceiptDate(gift.receivedOn),
              en: texts.bilingual ? bracketed(formatReceiptDateEn(gift.receivedOn)) : null,
            },
            amount: {
              cs: formatReceiptAmount(gift.amountMinor),
              en: texts.bilingual ? bracketed(formatReceiptAmountEn(gift.amountMinor)) : null,
            },
          })),
          count: texts.line('receipt.yearly.count', [String(receipt.gifts.length)]),
          total: texts.line('receipt.yearly.total', [year, totalCs], [year, totalEn]),
        },
    declaration: single
      ? texts.line(
          'receipt.declaration.single',
          [foundation.name, receivedOnCs, totalCs, foundation.bankAccountNumber],
          [foundation.name, receivedOnEn, totalEn, foundation.bankAccountNumber],
        )
      : texts.line(
          'receipt.declaration.yearly',
          [foundation.name, year, totalCs, foundation.bankAccountNumber],
          [foundation.name, year, totalEn, foundation.bankAccountNumber],
        ),
    signature: {
      issuedAt: texts.line(
        'receipt.issuedAt',
        [foundation.issuePlace, issuedOnCs],
        [foundation.issuePlaceEn, issuedOnEn],
      ),
      forFoundation: texts.line('receipt.signature.for', [foundation.name]),
      name: receipt.signatory.name,
      role: receipt.signatory.role,
      signatureImage: receipt.signatory.signatureImage?.sha256 ?? null,
      portraitImage: receipt.signatory.portraitImage?.sha256 ?? null,
      signatureAlt: texts.frozenCzechOr('receipt.signature.alt', captions.signatureAlt),
      portraitAlt: texts.frozenCzechOr('receipt.portrait.alt', captions.portraitAlt),
    },
    verification: {
      qrText: receipt.verification.qrText,
      heading: texts.frozenOr('receipt.verification.heading', captions.verificationHeading),
      text: texts.frozenOr('receipt.verification.text', captions.verificationText),
      alt: texts.frozenCzechOr('receipt.verification.alt', captions.verificationAlt),
    },
    footer: texts.line('receipt.footer', [
      foundation.name,
      foundation.companyIdentifier,
      foundationAddress,
      receipt.number,
    ]).cs,
  };
}

const GIFT_ROWS_PER_PAGE = 41;
const GIFT_ROWS_THE_REST_TAKES = 28;
const GIFT_ROWS_THE_BILINGUAL_REST_TAKES = 40;

export function estimatedReceiptPages(gifts: number, bilingual: boolean): number {
  const rest = bilingual ? GIFT_ROWS_THE_BILINGUAL_REST_TAKES : GIFT_ROWS_THE_REST_TAKES;
  return Math.max(1, Math.ceil((gifts + rest) / GIFT_ROWS_PER_PAGE));
}
