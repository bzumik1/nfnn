import { FrozenReceipt } from './frozen-receipt';

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

export interface ReceiptCaptions {
  readonly verificationHeading: Bilingual;
  readonly verificationText: Bilingual;
  readonly verificationAlt: string;
  readonly signatureAlt: string;
  readonly portraitAlt: string;
}

export function receiptDocument(
  receipt: FrozenReceipt,
  issuedAt: string,
  captions: ReceiptCaptions,
): ReceiptDocument {
  throw new Error(`not implemented ${receipt.number} ${issuedAt} ${captions.signatureAlt}`);
}
