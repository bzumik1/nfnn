import { QrSymbol as CaseSymbol, sharedCases } from '../../../../testing/shared-cases';
import {
  alphanumericSegment,
  byteSegment,
  eciSegment,
  encodeSegments,
  encodeText,
  numericSegment,
  QrErrorCorrection,
  QrSymbol,
  textSegments,
} from './qr-encoder';

const VERIFICATION_PREFIX = 'https://nfnn.cz/overit#1';
const SEVENTEEN_DIGITS = '72057594037927935';
const TWELVE_DIGITS = '123456789012';

function rows(symbol: QrSymbol): string[] {
  return Array.from({ length: symbol.size }, (_, row) =>
    symbol.modules.slice(row * symbol.size, (row + 1) * symbol.size),
  );
}

function described(text: string, errorCorrection: QrErrorCorrection): CaseSymbol {
  const segments = textSegments(text);
  const eci = segments.find((segment) => segment.mode === 'ECI');
  const data = segments.find((segment) => segment.mode !== 'ECI');
  const symbol = encodeText(text, errorCorrection);
  return {
    errorCorrection: symbol.errorCorrection,
    version: symbol.version,
    mode: data?.mode ?? 'BYTE',
    eci: eci?.mode === 'ECI' ? eci.assignment : null,
    mask: symbol.mask,
    size: symbol.size,
    matrix: rows(symbol),
  };
}

for (const sharedCase of sharedCases('qr/payment.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    it('when its SPAYD text is encoded at level H, then the symbol is the one ZXing drew, bit for bit', () => {
      expect(described(sharedCase.input.spayd, 'H')).toEqual(sharedCase.expected);
    });
  });
}

for (const sharedCase of sharedCases('qr/totp.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    it('when its otpauth URI is encoded at level M, then the symbol is the one ZXing drew, bit for bit', () => {
      expect(described(sharedCase.input.uri, 'M')).toEqual(sharedCase.expected);
    });
  });
}

describe('Given texts of each kind', () => {
  it('when only digits are given, then they become one numeric segment without an ECI header', () => {
    expect(textSegments('0123456789').map((segment) => segment.mode)).toEqual(['NUMERIC']);
  });

  it('when upper-case letters, digits and the nine symbols are given, then they become one alphanumeric segment', () => {
    expect(textSegments('SPD*1.0*AM:500.00 $%+-/').map((segment) => segment.mode)).toEqual([
      'ALPHANUMERIC',
    ]);
  });

  it('when a lower-case letter is given, then the text becomes bytes behind the ECI 1 header of ISO-8859-1', () => {
    expect(textSegments('otpauth://totp/x')).toEqual([
      eciSegment(1),
      byteSegment('otpauth://totp/x'),
    ]);
  });

  it('when an empty text is given, then it becomes an empty byte segment behind the ECI 1 header, as ZXing writes it', () => {
    expect(textSegments('')).toEqual([eciSegment(1), byteSegment('')]);
  });
});

describe('Given segments the encoder refuses', () => {
  it('when a numeric segment is given a letter, then it is refused', () => {
    expect(() => numericSegment('12a')).toThrowError(/digits/);
  });

  it('when an alphanumeric segment is given a lower-case letter, then it is refused', () => {
    expect(() => alphanumericSegment('SPD*a')).toThrowError(/alphanumeric/);
  });

  it('when a byte segment is given a character outside ISO-8859-1, then it is refused instead of written as a question mark', () => {
    expect(() => byteSegment('naděje')).toThrowError(/ISO-8859-1/);
  });

  it('when an ECI header is given an assignment beyond one byte, then it is refused', () => {
    expect(() => eciSegment(128)).toThrowError(/ECI/);
  });

  it('when the text does not fit version 40 at the chosen level, then it is refused', () => {
    expect(() => encodeText('9'.repeat(7090), 'L')).toThrowError(/version 40/);
    expect(() => encodeText('9'.repeat(3058), 'H')).toThrowError(/version 40/);
  });

  it('when the text just fits version 40, then it is encoded there', () => {
    expect(encodeText('9'.repeat(7089), 'L').version).toBe(40);
    expect(encodeText('9'.repeat(3057), 'H').version).toBe(40);
  });
});

describe('Given the verification link of a receipt, its prefix in bytes and its payload in digits', () => {
  it('when it is encoded at level M, then it takes the smallest version that holds its 275 bits', () => {
    const symbol = encodeSegments(
      [byteSegment(VERIFICATION_PREFIX), numericSegment(SEVENTEEN_DIGITS)],
      'M',
    );

    expect(symbol.errorCorrection).toBe('M');
    expect(symbol.version).toBe(3);
    expect(symbol.size).toBe(29);
  });

  it('when a payload of 258 bits is encoded at level L, then the chosen level is kept and version 2 holds it, while level M needs version 3', () => {
    const segments = [byteSegment(VERIFICATION_PREFIX), numericSegment(TWELVE_DIGITS)];

    expect(encodeSegments(segments, 'L')).toMatchObject({ errorCorrection: 'L', version: 2 });
    expect(encodeSegments(segments, 'M')).toMatchObject({ errorCorrection: 'M', version: 3 });
  });
});
