import { themeFont } from '../../../../../testing/receipt-assets';
import { ReceiptFonts } from '../receipt-layout';
import { ReceiptStyle } from '../receipt-style';

const POINTS_PER_MM = 72 / 25.4;

export const TEST_STYLE: ReceiptStyle = {
  colors: {
    text: '#1a1a2e',
    muted: '#555555',
    english: '#6b7280',
    rule: '#b8bec6',
    rowRule: '#dde1e6',
    tableHead: '#f1f3f5',
    card: '#f1f3f5',
    cardRule: '#b8bec6',
    notice: '#fdf1e3',
    noticeBorder: '#e0a458',
    code: '#000000',
  },
  sizes: { body: 9.5, small: 7.5, title: 13, heading: 10.5 },
  leading: 1.3,
  fonts: {
    body: 'body.0123456789abcdef.ttf',
    bold: 'body-bold.0123456789abcdef.ttf',
    heading: 'heading.0123456789abcdef.ttf',
  },
  margins: {
    top: 15 * POINTS_PER_MM,
    right: 18 * POINTS_PER_MM,
    bottom: 20 * POINTS_PER_MM,
    left: 18 * POINTS_PER_MM,
  },
};

export function themeFonts(theme = 'nova-nadeje'): ReceiptFonts {
  return {
    body: themeFont(theme, 'body'),
    bold: themeFont(theme, 'body-bold'),
    heading: themeFont(theme, 'heading'),
  };
}
