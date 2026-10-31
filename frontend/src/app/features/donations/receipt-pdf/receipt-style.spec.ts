import {
  RECEIPT_COLOR_TOKENS,
  RECEIPT_FONT_TOKENS,
  RECEIPT_LEADING_TOKEN,
  RECEIPT_MARGIN_TOKENS,
  RECEIPT_SIZE_TOKENS,
  ReceiptStyleRefused,
  resolveReceiptStyle,
} from './receipt-style';

const FONT_FILES = {
  body: 'body.0123456789abcdef.ttf',
  bold: 'body-bold.fedcba9876543210.ttf',
  heading: 'heading.00112233aabbccdd.ttf',
} as const;

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
    ...Object.fromEntries(Object.values(RECEIPT_COLOR_TOKENS).map((token) => [token, '#1a1a2e'])),
    [RECEIPT_COLOR_TOKENS.card]: '#F1F3F5',
    ...Object.fromEntries(Object.values(RECEIPT_SIZE_TOKENS).map((token) => [token, '9.5pt'])),
    ...Object.fromEntries(Object.values(RECEIPT_MARGIN_TOKENS).map((token) => [token, '18mm'])),
    ...Object.fromEntries(
      Object.entries(RECEIPT_FONT_TOKENS).map(([role, token]) => [
        token,
        `'${FONT_FILES[role as keyof typeof FONT_FILES]}'`,
      ]),
    ),
    [RECEIPT_LEADING_TOKEN]: '1.3',
  };
}

function refusal(values: Record<string, string>): unknown {
  try {
    resolveReceiptStyle(themed(values));
  } catch (failure: unknown) {
    return failure;
  }
  return null;
}

describe('Given an element that carries every receipt token of the theme', () => {
  afterEach(() => document.body.replaceChildren());

  it('when the style is resolved, then colours are the literal hex values read as text, sizes stay points and millimetres become points', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const element = themed({
      ...everyToken(),
      [RECEIPT_SIZE_TOKENS.title]: '13pt',
      [RECEIPT_MARGIN_TOKENS.top]: '15mm',
    });

    const style = resolveReceiptStyle(element);

    expect(style.colors.text).toBe('#1a1a2e');
    expect(style.colors.card).toBe('#f1f3f5');
    expect(getContext).not.toHaveBeenCalled();
    expect(style.sizes.title).toBe(13);
    expect(style.sizes.body).toBe(9.5);
    expect(style.margins.top).toBeCloseTo((15 * 72) / 25.4, 6);
    expect(style.margins.left).toBeCloseTo((18 * 72) / 25.4, 6);
    expect(style.leading).toBe(1.3);
  });

  it('when the style is resolved, then the fonts are the content-named files the theme names', () => {
    expect(resolveReceiptStyle(themed(everyToken())).fonts).toEqual(FONT_FILES);
  });

  it('when the result is handed to the worker, then it is a plain object a structured clone keeps whole', () => {
    const style = resolveReceiptStyle(themed(everyToken()));

    expect(structuredClone(style)).toEqual(style);
  });
});

describe('Given an element whose receipt tokens the receipt cannot take', () => {
  afterEach(() => document.body.replaceChildren());

  it('when one is missing, then the missing token is named', () => {
    const values = everyToken();
    delete values[RECEIPT_COLOR_TOKENS.code];

    expect(() => resolveReceiptStyle(themed(values))).toThrow(/--receipt-color-code/);
  });

  it('when a size has a unit the receipt does not take, then it is refused', () => {
    expect(() =>
      resolveReceiptStyle(themed({ ...everyToken(), [RECEIPT_SIZE_TOKENS.body]: '1rem' })),
    ).toThrow(/--receipt-size-body/);
  });

  for (const color of ['teal', 'rgb(0, 0, 0)', 'color-mix(in srgb, white 50%, black)', '#000']) {
    it(`when a colour is ${color} rather than a literal #rrggbb, then it is refused, as no canvas converts it`, () => {
      expect(() =>
        resolveReceiptStyle(themed({ ...everyToken(), [RECEIPT_COLOR_TOKENS.rule]: color })),
      ).toThrow(/--receipt-color-rule/);
    });
  }

  for (const file of ['body.ttf', '../body.0123456789abcdef.ttf', 'body.0123456789ABCDEF.ttf']) {
    it(`when the body font is named ${file}, then it is refused, as only content-named files are fetched`, () => {
      expect(() =>
        resolveReceiptStyle(themed({ ...everyToken(), [RECEIPT_FONT_TOKENS.body]: `'${file}'` })),
      ).toThrow(/--receipt-font-body/);
    });
  }

  for (const [token, color] of [
    [RECEIPT_COLOR_TOKENS.text, '#ffffff'],
    [RECEIPT_COLOR_TOKENS.muted, '#bbbbbb'],
    [RECEIPT_COLOR_TOKENS.english, '#eeeeee'],
    [RECEIPT_COLOR_TOKENS.code, '#cccccc'],
  ] as const) {
    it(`when ${token} is ${color}, too faint on the white page, then the style is refused as unreadable instead of drawing a blank receipt`, () => {
      const refused = refusal({ ...everyToken(), [token]: color });

      expect(refused).toBeInstanceOf(ReceiptStyleRefused);
      expect((refused as Error).message).toMatch(new RegExp(`${token}.*contrast`));
    });
  }
});
