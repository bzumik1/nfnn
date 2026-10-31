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

const POINTS_PER_MM = 72 / 25.4;
const HEX = /^#[0-9a-f]{6}$/;

function tokenValue(style: CSSStyleDeclaration, token: string): string {
  const value = style.getPropertyValue(token).trim();
  if (value === '') {
    throw new Error(`The theme does not set the receipt token ${token}.`);
  }
  return value;
}

function measured(style: CSSStyleDeclaration, token: string, unit: 'pt' | 'mm'): number {
  const value = tokenValue(style, token);
  const match = new RegExp(`^(\\d+(?:\\.\\d+)?)${unit}$`).exec(value);
  if (match === null) {
    throw new Error(`The receipt token ${token} is ${value}, not a length in ${unit}.`);
  }
  return Number(match[1]);
}

function mapped<T extends Record<string, string>, V>(
  tokens: T,
  value: (token: string) => V,
): { readonly [K in keyof T]: V } {
  return Object.fromEntries(
    Object.entries(tokens).map(([name, token]) => [name, value(token)]),
  ) as { readonly [K in keyof T]: V };
}

export function resolveReceiptStyle(element: Element, toHex: CssColorToHex): ReceiptStyle {
  const style = getComputedStyle(element);
  const leading = tokenValue(style, RECEIPT_LEADING_TOKEN);
  if (!/^\d+(\.\d+)?$/.test(leading)) {
    throw new Error(`The receipt token ${RECEIPT_LEADING_TOKEN} is ${leading}, not a number.`);
  }
  return {
    colors: mapped(RECEIPT_COLOR_TOKENS, (token) => {
      const hex = toHex(tokenValue(style, token)).toLowerCase();
      if (!HEX.test(hex)) {
        throw new Error(`The receipt token ${token} gives no colour the receipt can print.`);
      }
      return hex;
    }),
    sizes: mapped(RECEIPT_SIZE_TOKENS, (token) => measured(style, token, 'pt')),
    leading: Number(leading),
    margins: mapped(RECEIPT_MARGIN_TOKENS, (token) => measured(style, token, 'mm') * POINTS_PER_MM),
  };
}

export function canvasColorToHex(): CssColorToHex {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (cssColor) => {
    if (context === null) {
      return cssColor;
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = cssColor;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  };
}
