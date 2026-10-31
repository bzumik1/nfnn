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
import { decodeMatrix } from './testing/plain-qr-decoder';
import { DATA_CODEWORDS } from './testing/qr-capacities';

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

for (const sharedCase of sharedCases('qr/encoder.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    it('when its text is encoded at its level, then the symbol is the one ZXing drew, bit for bit', () => {
      expect(described(sharedCase.input.text, sharedCase.input.errorCorrection)).toEqual(
        sharedCase.expected,
      );
    });
  });
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
    expect(() => encodeText('9'.repeat(3058), 'H')).toThrowError(/version 40/);
    expect(() => encodeText('a'.repeat(2953), 'L')).toThrowError(/version 40/);
  });

  it('when a text is longer than any QR code holds, then it is refused before any work, with a message of its own', () => {
    expect(() => encodeText('9'.repeat(7090), 'L')).toThrowError(/at most 7089 characters/);
    expect(() => byteSegment('a'.repeat(10_000_000))).toThrowError(/at most 7089 characters/);
    expect(() => numericSegment('9'.repeat(10_000_000))).toThrowError(/at most 7089 characters/);
    expect(() => alphanumericSegment('A'.repeat(10_000_000))).toThrowError(
      /at most 7089 characters/,
    );
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

const LEVELS: readonly QrErrorCorrection[] = ['L', 'M', 'Q', 'H'];
const RANDOM_SYMBOLS = 80;
const LONGEST_RANDOM_PAYLOAD = 600;
const RANDOM_LOOP_TIMEOUT_MS = 30_000;

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function bitsNeeded(prefix: number, digits: number, eci: boolean, version: number): number {
  const group = version < 10 ? 0 : version < 27 ? 1 : 2;
  const byteCount = [8, 16, 16][group];
  const digitCount = [10, 12, 14][group];
  const digitBits = Math.floor(digits / 3) * 10 + [0, 4, 7][digits % 3];
  return (eci ? 12 : 0) + 4 + byteCount + 8 * prefix + 4 + digitCount + digitBits;
}

function smallestVersion(
  prefix: number,
  digits: number,
  eci: boolean,
  level: QrErrorCorrection,
): number {
  return (
    DATA_CODEWORDS[level].findIndex(
      (codewords, index) => bitsNeeded(prefix, digits, eci, index + 1) <= codewords * 8,
    ) + 1
  );
}

describe('Given random links of a prefix in bytes and a payload in digits, from a fixed seed', () => {
  it(
    'when each is encoded at a random level, then jsQR reads back both segments at the smallest version that holds them',
    () => {
      const random = seededRandom(20261030);
      for (let index = 0; index < RANDOM_SYMBOLS; index++) {
        const level = LEVELS[index % LEVELS.length];
        const prefix = Array.from({ length: 1 + Math.floor(random() * 40) }, () =>
          String.fromCharCode(32 + Math.floor(random() * 224)),
        ).join('');
        const digits = Array.from(
          { length: 1 + Math.floor(random() ** 2 * LONGEST_RANDOM_PAYLOAD) },
          () => String(Math.floor(random() * 10)),
        ).join('');
        const eci = index % 5 === 4;
        const segments = [
          ...(eci ? [eciSegment(1)] : []),
          byteSegment(prefix),
          numericSegment(digits),
        ];

        const symbol = encodeSegments(segments, level);
        const decoded = decodeMatrix(symbol);

        const label = `symbol ${index} at level ${level}`;
        expect(symbol.version, label).toBe(
          smallestVersion(prefix.length, digits.length, eci, level),
        );
        expect(decoded?.version, label).toBe(symbol.version);
        expect(
          decoded?.chunks.map((chunk) =>
            'bytes' in chunk ? chunk.bytes : 'text' in chunk ? chunk.text : chunk.assignmentNumber,
          ),
          label,
        ).toEqual([
          ...(eci ? [1] : []),
          Array.from(prefix, (character) => character.charCodeAt(0)),
          digits,
        ]);
      }
    },
    RANDOM_LOOP_TIMEOUT_MS,
  );
});

describe('Given segments that a smaller version would hold', () => {
  it('when a minimum version is given, then the symbol takes that version and decodes to the same text', () => {
    const symbol = encodeSegments([byteSegment('https://nfnn.cz/overit#'), numericSegment('1')], 'L', 14);

    expect(symbol.version).toBe(14);
    expect(symbol.size).toBe(73);
    expect(decodeMatrix(symbol)?.data).toBe('https://nfnn.cz/overit#1');
  });

  it('when the minimum version is below the smallest that holds them, then the smallest that holds them is taken', () => {
    const text = SEVENTEEN_DIGITS.repeat(10);

    expect(encodeSegments([numericSegment(text)], 'M', 1).version).toBe(
      encodeSegments([numericSegment(text)], 'M').version,
    );
  });
});
