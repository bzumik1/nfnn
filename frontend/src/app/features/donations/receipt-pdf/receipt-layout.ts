import PDFDocument from 'pdfkit';
import { ReceiptArt } from './receipt-art';
import { ReceiptDocument } from './receipt-document';
import { ReceiptStyle } from './receipt-style';

export interface ReceiptFonts {
  readonly body: Uint8Array;
  readonly bold: Uint8Array;
  readonly heading: Uint8Array;
}

export interface ReceiptAssets {
  readonly fonts: ReceiptFonts;
  readonly signature: ReceiptArt | null;
  readonly portrait: ReceiptArt | null;
}

export function drawReceipt(
  document: ReceiptDocument,
  style: ReceiptStyle,
  assets: ReceiptAssets,
  onPage: (page: number) => void = () => undefined,
): Promise<Uint8Array> {
  return Promise.reject(
    new Error(`not implemented ${typeof PDFDocument} ${document.number} ${style.leading} ${assets.signature?.kind} ${typeof onPage}`),
  );
}
