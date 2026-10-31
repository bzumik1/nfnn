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
  readonly fonts: {
    readonly body: string;
    readonly bold: string;
    readonly heading: string;
  };
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

export const RECEIPT_FONT_TOKENS = {
  body: '--receipt-font-body',
  bold: '--receipt-font-bold',
  heading: '--receipt-font-heading',
} as const;

export class ReceiptStyleRefused extends Error {}

const POINTS_PER_MM = 72 / 25.4;
const HEX = /^#[0-9a-fA-F]{6}$/;
const FONT_FILE = /^(?:body|body-bold|heading)\.[0-9a-f]{16}\.ttf$/;
const QUOTED = /^(['"])(.*)\1$/;
const PAGE = '#ffffff';
const MINIMUM_CONTRAST = 4.5;
const READ_ON_THE_PAGE = ['text', 'muted', 'english', 'code'] as const;

function tokenValue(style: CSSStyleDeclaration, token: string): string {
  const value = style.getPropertyValue(token).trim();
  if (value === '') {
    throw new ReceiptStyleRefused(`The theme does not set the receipt token ${token}.`);
  }
  return value;
}

function measured(style: CSSStyleDeclaration, token: string, unit: 'pt' | 'mm'): number {
  const value = tokenValue(style, token);
  const match = new RegExp(`^(\\d+(?:\\.\\d+)?)${unit}$`).exec(value);
  if (match === null) {
    throw new ReceiptStyleRefused(
      `The receipt token ${token} is ${value}, not a length in ${unit}.`,
    );
  }
  return Number(match[1]);
}

function color(style: CSSStyleDeclaration, token: string): string {
  const value = tokenValue(style, token);
  if (!HEX.test(value)) {
    throw new ReceiptStyleRefused(
      `The receipt token ${token} is ${value}, not a literal #rrggbb colour.`,
    );
  }
  return value.toLowerCase();
}

function fontFile(style: CSSStyleDeclaration, token: string): string {
  const value = tokenValue(style, token);
  const file = QUOTED.exec(value)?.[2] ?? value;
  if (!FONT_FILE.test(file)) {
    throw new ReceiptStyleRefused(
      `The receipt token ${token} is ${value}, not a content-named receipt font file.`,
    );
  }
  return file;
}

function mapped<T extends Record<string, string>, V>(
  tokens: T,
  value: (token: string) => V,
): { readonly [K in keyof T]: V } {
  return Object.fromEntries(
    Object.entries(tokens).map(([name, token]) => [name, value(token)]),
  ) as { readonly [K in keyof T]: V };
}

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (first, second) => second - first,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

export function checkedReceiptStyle(style: ReceiptStyle): ReceiptStyle {
  for (const role of READ_ON_THE_PAGE) {
    const value = style.colors[role];
    if (!HEX.test(value)) {
      throw new ReceiptStyleRefused(
        `The receipt colour ${RECEIPT_COLOR_TOKENS[role]} is ${value}, not a literal #rrggbb colour.`,
      );
    }
    const ratio = contrast(value, PAGE);
    if (ratio < MINIMUM_CONTRAST) {
      throw new ReceiptStyleRefused(
        `The receipt colour ${RECEIPT_COLOR_TOKENS[role]} ${value} has a contrast of ${ratio.toFixed(2)}:1 on the white page, below ${MINIMUM_CONTRAST}:1.`,
      );
    }
  }
  return style;
}

export function resolveReceiptStyle(element: Element): ReceiptStyle {
  const style = getComputedStyle(element);
  const leading = tokenValue(style, RECEIPT_LEADING_TOKEN);
  if (!/^\d+(\.\d+)?$/.test(leading)) {
    throw new ReceiptStyleRefused(
      `The receipt token ${RECEIPT_LEADING_TOKEN} is ${leading}, not a number.`,
    );
  }
  return checkedReceiptStyle({
    colors: mapped(RECEIPT_COLOR_TOKENS, (token) => color(style, token)),
    sizes: mapped(RECEIPT_SIZE_TOKENS, (token) => measured(style, token, 'pt')),
    leading: Number(leading),
    fonts: mapped(RECEIPT_FONT_TOKENS, (token) => fontFile(style, token)),
    margins: mapped(RECEIPT_MARGIN_TOKENS, (token) => measured(style, token, 'mm') * POINTS_PER_MM),
  });
}
