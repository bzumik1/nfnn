import {
  RECEIPT_COLOR_TOKENS,
  RECEIPT_LEADING_TOKEN,
  RECEIPT_MARGIN_TOKENS,
  RECEIPT_SIZE_TOKENS,
  resolveReceiptStyle,
} from './receipt-style';

function themed(values: Record<string, string>): HTMLElement {
  const element = document.createElement('div');
  for (const [token, value] of Object.entries(values)) {
    element.style.setProperty(token, value);
  }
  document.body.appendChild(element);
  return element;
}

function everyToken(): Record<string, string> {
  return {
    ...Object.fromEntries(Object.values(RECEIPT_COLOR_TOKENS).map((token) => [token, 'teal'])),
    ...Object.fromEntries(Object.values(RECEIPT_SIZE_TOKENS).map((token) => [token, '9.5pt'])),
    ...Object.fromEntries(Object.values(RECEIPT_MARGIN_TOKENS).map((token) => [token, '18mm'])),
    [RECEIPT_LEADING_TOKEN]: '1.3',
  };
}

describe('Given an element that carries every receipt token of the theme', () => {
  afterEach(() => document.body.replaceChildren());

  it('when the style is resolved, then colours go through the converter, sizes stay points and millimetres become points', () => {
    const element = themed({
      ...everyToken(),
      [RECEIPT_COLOR_TOKENS.card]: 'color-mix(in srgb, white 50%, black)',
      [RECEIPT_SIZE_TOKENS.title]: '13pt',
      [RECEIPT_MARGIN_TOKENS.top]: '15mm',
    });
    const seen: string[] = [];

    const style = resolveReceiptStyle(element, (color) => {
      seen.push(color);
      return color === 'teal' ? '#008080' : '#808080';
    });

    expect(style.colors.text).toBe('#008080');
    expect(style.colors.card).toBe('#808080');
    expect(seen).toContain('color-mix(in srgb, white 50%, black)');
    expect(style.sizes.title).toBe(13);
    expect(style.sizes.body).toBe(9.5);
    expect(style.margins.top).toBeCloseTo((15 * 72) / 25.4, 6);
    expect(style.margins.left).toBeCloseTo((18 * 72) / 25.4, 6);
    expect(style.leading).toBe(1.3);
  });

  it('when the result is handed to the worker, then it is a plain object a structured clone keeps whole', () => {
    const style = resolveReceiptStyle(themed(everyToken()), () => '#000000');

    expect(structuredClone(style)).toEqual(style);
  });
});

describe('Given an element without one of the receipt tokens', () => {
  afterEach(() => document.body.replaceChildren());

  it('when the style is resolved, then the missing token is named', () => {
    const values = everyToken();
    delete values[RECEIPT_COLOR_TOKENS.code];

    expect(() => resolveReceiptStyle(themed(values), () => '#000000')).toThrow(
      /--receipt-color-code/,
    );
  });

  it('when a size has a unit the receipt does not take, then it is refused', () => {
    expect(() =>
      resolveReceiptStyle(
        themed({ ...everyToken(), [RECEIPT_SIZE_TOKENS.body]: '1rem' }),
        () => '#000000',
      ),
    ).toThrow(/--receipt-size-body/);
  });

  it('when the converter gives no hex colour, then it is refused', () => {
    expect(() => resolveReceiptStyle(themed(everyToken()), () => 'teal')).toThrow(
      /--receipt-color-text/,
    );
  });
});
