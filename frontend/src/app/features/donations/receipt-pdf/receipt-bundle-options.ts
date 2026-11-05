export interface ReceiptPdfInfo {
  readonly title: string;
  readonly author: string;
  readonly subject: string;
  readonly createdAt: string;
}

export interface ReceiptBundleOptions {
  readonly info: ReceiptPdfInfo;
  readonly duplex: boolean;
}
