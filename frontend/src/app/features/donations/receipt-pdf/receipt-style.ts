export interface ReceiptStyle {
  readonly colors: {
    readonly text: string;
    readonly muted: string;
    readonly english: string;
    readonly rule: string;
    readonly rowRule: string;
    readonly tableHead: string;
    readonly card: string;
    readonly cardRule: string;
    readonly notice: string;
    readonly noticeBorder: string;
    readonly code: string;
  };
  readonly sizes: {
    readonly body: number;
    readonly small: number;
    readonly title: number;
    readonly heading: number;
  };
  readonly leading: number;
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
}

export const RECEIPT_COLOR_TOKENS = {
  text: '--receipt-color-text',
  muted: '--receipt-color-muted',
  english: '--receipt-color-english',
  rule: '--receipt-color-rule',
  rowRule: '--receipt-color-row-rule',
  tableHead: '--receipt-color-table-head',
  card: '--receipt-color-card',
  cardRule: '--receipt-color-card-rule',
  notice: '--receipt-color-notice',
  noticeBorder: '--receipt-color-notice-border',
  code: '--receipt-color-code',
} as const;

export const RECEIPT_SIZE_TOKENS = {
  body: '--receipt-size-body',
  small: '--receipt-size-small',
  title: '--receipt-size-title',
  heading: '--receipt-size-heading',
} as const;

export const RECEIPT_MARGIN_TOKENS = {
  top: '--receipt-margin-top',
  right: '--receipt-margin-right',
  bottom: '--receipt-margin-bottom',
  left: '--receipt-margin-left',
} as const;

export const RECEIPT_LEADING_TOKEN = '--receipt-leading';

export type CssColorToHex = (cssColor: string) => string;

export function resolveReceiptStyle(element: Element, toHex: CssColorToHex): ReceiptStyle {
  throw new Error(`not implemented ${element.tagName} ${typeof toHex}`);
}
