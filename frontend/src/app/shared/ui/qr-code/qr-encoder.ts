import { alignmentCentres, QrMatrix } from './qr-matrix';

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export type QrDataMode = 'NUMERIC' | 'ALPHANUMERIC' | 'BYTE';

export type QrSegment =
  | { readonly mode: 'ECI'; readonly assignment: number }
  | { readonly mode: QrDataMode; readonly characters: number; readonly bits: readonly number[] };

export interface QrSymbol extends QrMatrix {
  readonly version: number;
  readonly errorCorrection: QrErrorCorrection;
  readonly mask: number;
}

const MAX_VERSION = 40;
const LONGEST_QR_TEXT = 7089;
const ISO_8859_1_ECI = 1;
const LARGEST_ONE_BYTE_ECI = 127;
const LARGEST_LATIN1_CODE = 0xff;
const ALPHANUMERIC_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const DIGITS = /^[0-9]*$/;
const ALPHANUMERIC_PAIR_BITS = 11;
const ALPHANUMERIC_SINGLE_BITS = 6;
const BYTE_BITS = 8;
const MODE_INDICATOR_BITS = 4;
const MODE_INDICATORS: Readonly<Record<QrSegment['mode'], number>> = {
  NUMERIC: 0b0001,
  ALPHANUMERIC: 0b0010,
  BYTE: 0b0100,
  ECI: 0b0111,
};
const ECI_ASSIGNMENT_BITS = 8;
const COUNT_BITS: Readonly<Record<QrDataMode, readonly [number, number, number]>> = {
  NUMERIC: [10, 12, 14],
  ALPHANUMERIC: [9, 11, 13],
  BYTE: [8, 16, 16],
};
const TERMINATOR_BITS = 4;
const PAD_CODEWORDS = [0xec, 0x11];

const EC_CODEWORDS_PER_BLOCK: Readonly<Record<QrErrorCorrection, readonly number[]>> = {
  L: [
    7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30,
    26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30,
    30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};
const EC_BLOCKS: Readonly<Record<QrErrorCorrection, readonly number[]>> = {
  L: [
    1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
    16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  M: [
    1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
    26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34,
    35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37,
    40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
};

const FORMAT_LEVEL_BITS: Readonly<Record<QrErrorCorrection, number>> = { L: 1, M: 0, Q: 3, H: 2 };
const FORMAT_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;
const VERSION_GENERATOR = 0x1f25;
const FIRST_VERSION_WITH_VERSION_BITS = 7;
const TIMING = 6;
const FINDER_REACH = 4;
const ALIGNMENT_REACH = 2;

const GALOIS_FIELD_POLYNOMIAL = 0x11d;
const GALOIS_FIELD_SIZE = 256;

const RUN_PENALTY = 3;
const SHORTEST_PENALISED_RUN = 5;
const BLOCK_PENALTY = 3;
const FINDER_LIKE_PENALTY = 40;
const FINDER_LIKE = [1, 0, 1, 1, 1, 0, 1];
const FINDER_LIKE_MARGIN = 4;
const BALANCE_PENALTY = 10;

const MASKS: readonly ((column: number, row: number) => boolean)[] = [
  (column, row) => (column + row) % 2 === 0,
  (_column, row) => row % 2 === 0,
  (column) => column % 3 === 0,
  (column, row) => (column + row) % 3 === 0,
  (column, row) => (Math.floor(column / 3) + Math.floor(row / 2)) % 2 === 0,
  (column, row) => ((column * row) % 2) + ((column * row) % 3) === 0,
  (column, row) => (((column * row) % 2) + ((column * row) % 3)) % 2 === 0,
  (column, row) => (((column + row) % 2) + ((column * row) % 3)) % 2 === 0,
];

export function encodeText(text: string, errorCorrection: QrErrorCorrection): QrSymbol {
  refuseLongerThanAnyQr(text);
  return encodeSegments(textSegments(text), errorCorrection);
}

export function encodeSegments(
  segments: readonly QrSegment[],
  errorCorrection: QrErrorCorrection,
): QrSymbol {
  const version = smallestVersion(segments, errorCorrection);
  const codewords = withErrorCorrection(
    dataCodewords(segments, version, errorCorrection),
    version,
    errorCorrection,
  );
  const symbol = new SymbolGrid(version);
  const chosen = MASKS.map((_, mask) => {
    const modules = symbol.draw(codewords, errorCorrection, mask);
    return { mask, modules, penalty: maskPenalty(modules, symbol.size) };
  }).reduce((lowest, candidate) => (candidate.penalty < lowest.penalty ? candidate : lowest));
  return {
    size: symbol.size,
    modules: chosen.modules.join(''),
    version,
    errorCorrection,
    mask: chosen.mask,
  };
}

export function textSegments(text: string): readonly QrSegment[] {
  if (text.length > 0 && DIGITS.test(text)) {
    return [numericSegment(text)];
  }
  if (text.length > 0 && Array.from(text).every((character) => isAlphanumeric(character))) {
    return [alphanumericSegment(text)];
  }
  return [eciSegment(ISO_8859_1_ECI), byteSegment(text)];
}

export function numericSegment(digits: string): QrSegment {
  refuseLongerThanAnyQr(digits);
  if (!DIGITS.test(digits)) {
    throw new Error('A numeric QR segment holds digits only');
  }
  const bits: number[] = [];
  for (let start = 0; start < digits.length; start += 3) {
    const group = digits.slice(start, start + 3);
    appendBits(bits, Number(group), group.length * 3 + 1);
  }
  return { mode: 'NUMERIC', characters: digits.length, bits };
}

export function alphanumericSegment(text: string): QrSegment {
  refuseLongerThanAnyQr(text);
  if (!Array.from(text).every((character) => isAlphanumeric(character))) {
    throw new Error('An alphanumeric QR segment holds only 0-9, A-Z, space and $%*+-./:');
  }
  const bits: number[] = [];
  for (let start = 0; start < text.length; start += 2) {
    const first = ALPHANUMERIC_CHARACTERS.indexOf(text[start]);
    if (start + 1 < text.length) {
      const second = ALPHANUMERIC_CHARACTERS.indexOf(text[start + 1]);
      appendBits(bits, first * ALPHANUMERIC_CHARACTERS.length + second, ALPHANUMERIC_PAIR_BITS);
    } else {
      appendBits(bits, first, ALPHANUMERIC_SINGLE_BITS);
    }
  }
  return { mode: 'ALPHANUMERIC', characters: text.length, bits };
}

export function byteSegment(text: string): QrSegment {
  refuseLongerThanAnyQr(text);
  const bits: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code > LARGEST_LATIN1_CODE) {
      throw new Error('A byte QR segment holds ISO-8859-1 characters only');
    }
    appendBits(bits, code, BYTE_BITS);
  }
  return { mode: 'BYTE', characters: text.length, bits };
}

export function eciSegment(assignment: number): QrSegment {
  if (!Number.isInteger(assignment) || assignment < 0 || assignment > LARGEST_ONE_BYTE_ECI) {
    throw new Error('An ECI header takes an assignment number from 0 to 127');
  }
  return { mode: 'ECI', assignment };
}

function refuseLongerThanAnyQr(text: string): void {
  if (text.length > LONGEST_QR_TEXT) {
    throw new Error(`A QR code holds at most ${LONGEST_QR_TEXT} characters`);
  }
}

function isAlphanumeric(character: string): boolean {
  return ALPHANUMERIC_CHARACTERS.includes(character);
}

function appendBits(bits: number[], value: number, length: number): void {
  for (let bit = length - 1; bit >= 0; bit--) {
    bits.push(Math.floor(value / 2 ** bit) % 2);
  }
}

function countBits(mode: QrDataMode, version: number): number {
  return COUNT_BITS[mode][version < 10 ? 0 : version < 27 ? 1 : 2];
}

function segmentLength(segment: QrSegment, version: number): number {
  if (segment.mode === 'ECI') {
    return MODE_INDICATOR_BITS + ECI_ASSIGNMENT_BITS;
  }
  const count = countBits(segment.mode, version);
  return segment.characters < 2 ** count
    ? MODE_INDICATOR_BITS + count + segment.bits.length
    : Infinity;
}

function rawCodewords(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2;
    modules -= (25 * alignments - 10) * alignments - 55;
  }
  if (version >= FIRST_VERSION_WITH_VERSION_BITS) {
    modules -= 36;
  }
  return Math.floor(modules / 8);
}

function dataCapacity(version: number, errorCorrection: QrErrorCorrection): number {
  return (
    rawCodewords(version) -
    EC_CODEWORDS_PER_BLOCK[errorCorrection][version - 1] * EC_BLOCKS[errorCorrection][version - 1]
  );
}

function smallestVersion(segments: readonly QrSegment[], errorCorrection: QrErrorCorrection) {
  for (let version = 1; version <= MAX_VERSION; version++) {
    const length = segments.reduce((sum, segment) => sum + segmentLength(segment, version), 0);
    if (length <= dataCapacity(version, errorCorrection) * 8) {
      return version;
    }
  }
  throw new Error(`The text does not fit a QR code of version 40 at level ${errorCorrection}`);
}

function dataCodewords(
  segments: readonly QrSegment[],
  version: number,
  errorCorrection: QrErrorCorrection,
): number[] {
  const bits: number[] = [];
  for (const segment of segments) {
    appendBits(bits, MODE_INDICATORS[segment.mode], MODE_INDICATOR_BITS);
    if (segment.mode === 'ECI') {
      appendBits(bits, segment.assignment, ECI_ASSIGNMENT_BITS);
    } else {
      appendBits(bits, segment.characters, countBits(segment.mode, version));
      bits.push(...segment.bits);
    }
  }
  const capacity = dataCapacity(version, errorCorrection);
  appendBits(bits, 0, Math.min(TERMINATOR_BITS, capacity * 8 - bits.length));
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8);
  const codewords: number[] = [];
  for (let start = 0; start < bits.length; start += 8) {
    codewords.push(bits.slice(start, start + 8).reduce((byte, bit) => byte * 2 + bit, 0));
  }
  for (let pad = 0; codewords.length < capacity; pad++) {
    codewords.push(PAD_CODEWORDS[pad % 2]);
  }
  return codewords;
}

function withErrorCorrection(
  data: readonly number[],
  version: number,
  errorCorrection: QrErrorCorrection,
): number[] {
  const blocks = EC_BLOCKS[errorCorrection][version - 1];
  const ecLength = EC_CODEWORDS_PER_BLOCK[errorCorrection][version - 1];
  const raw = rawCodewords(version);
  const shortBlocks = blocks - (raw % blocks);
  const shortDataLength = Math.floor(raw / blocks) - ecLength;
  const generator = generatorPolynomial(ecLength);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let block = 0, start = 0; block < blocks; block++) {
    const length = shortDataLength + (block < shortBlocks ? 0 : 1);
    const blockData = data.slice(start, start + length);
    start += length;
    dataBlocks.push(blockData);
    ecBlocks.push(remainder(blockData, generator));
  }
  const interleaved: number[] = [];
  for (let index = 0; index <= shortDataLength; index++) {
    for (const blockData of dataBlocks) {
      if (index < blockData.length) {
        interleaved.push(blockData[index]);
      }
    }
  }
  for (let index = 0; index < ecLength; index++) {
    for (const blockEc of ecBlocks) {
      interleaved.push(blockEc[index]);
    }
  }
  return interleaved;
}

const { exponents, logarithms } = galoisField();

function galoisField(): { exponents: number[]; logarithms: number[] } {
  const powers: number[] = [];
  const logs: number[] = new Array(GALOIS_FIELD_SIZE).fill(0);
  for (let power = 0, value = 1; power < GALOIS_FIELD_SIZE - 1; power++) {
    powers.push(value);
    logs[value] = power;
    value *= 2;
    if (value >= GALOIS_FIELD_SIZE) {
      value ^= GALOIS_FIELD_POLYNOMIAL;
    }
  }
  return { exponents: [...powers, ...powers], logarithms: logs };
}

function multiply(first: number, second: number): number {
  return first === 0 || second === 0 ? 0 : exponents[logarithms[first] + logarithms[second]];
}

function generatorPolynomial(degree: number): number[] {
  let polynomial = [1];
  for (let root = 0; root < degree; root++) {
    const product: number[] = new Array(polynomial.length + 1).fill(0);
    polynomial.forEach((coefficient, index) => {
      product[index] ^= coefficient;
      product[index + 1] ^= multiply(coefficient, exponents[root]);
    });
    polynomial = product;
  }
  return polynomial.slice(1);
}

function remainder(data: readonly number[], generator: readonly number[]): number[] {
  const register: number[] = new Array(generator.length).fill(0);
  for (const codeword of data) {
    const factor = codeword ^ (register.shift() as number);
    register.push(0);
    generator.forEach((coefficient, index) => {
      register[index] ^= multiply(coefficient, factor);
    });
  }
  return register;
}

class SymbolGrid {
  readonly size: number;
  private readonly functionModules: Uint8Array;
  private readonly functionPattern: Uint8Array;

  constructor(private readonly version: number) {
    this.size = version * 4 + 17;
    this.functionModules = new Uint8Array(this.size * this.size);
    this.functionPattern = new Uint8Array(this.size * this.size);
    this.drawFunctionPatterns();
  }

  draw(codewords: readonly number[], errorCorrection: QrErrorCorrection, mask: number): Uint8Array {
    const modules = Uint8Array.from(this.functionPattern);
    this.drawFormat(modules, errorCorrection, mask);
    const isMasked = MASKS[mask];
    let bit = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === TIMING) {
        right--;
      }
      const upward = ((right + 1) & 2) === 0;
      for (let step = 0; step < this.size; step++) {
        const row = upward ? this.size - 1 - step : step;
        for (const column of [right, right - 1]) {
          if (this.functionModules[row * this.size + column] === 0) {
            const dark =
              bit < codewords.length * 8 && ((codewords[bit >> 3] >> (7 - (bit & 7))) & 1) === 1;
            bit++;
            modules[row * this.size + column] = dark !== isMasked(column, row) ? 1 : 0;
          }
        }
      }
    }
    return modules;
  }

  private drawFunctionPatterns(): void {
    for (let index = 0; index < this.size; index++) {
      this.set(this.functionPattern, TIMING, index, index % 2 === 0);
      this.set(this.functionPattern, index, TIMING, index % 2 === 0);
    }
    const far = this.size - 1 - (FINDER_REACH - 1);
    for (const [x, y] of [
      [FINDER_REACH - 1, FINDER_REACH - 1],
      [far, FINDER_REACH - 1],
      [FINDER_REACH - 1, far],
    ]) {
      this.drawSquares(x, y, FINDER_REACH, (distance) => distance !== 2 && distance !== 4);
    }
    const centres = alignmentCentres(this.size);
    const last = centres.length - 1;
    centres.forEach((y, row) =>
      centres.forEach((x, column) => {
        const besideFinder = (row === 0 || row === last) && (column === 0 || column === last);
        if (!besideFinder || (row === last && column === last)) {
          this.drawSquares(x, y, ALIGNMENT_REACH, (distance) => distance !== 1);
        }
      }),
    );
    this.drawFormat(this.functionPattern, 'L', 0);
    this.drawVersion();
  }

  private drawSquares(
    x: number,
    y: number,
    reach: number,
    isDark: (distance: number) => boolean,
  ): void {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const column = x + dx;
        const row = y + dy;
        if (column >= 0 && column < this.size && row >= 0 && row < this.size) {
          this.set(this.functionPattern, column, row, isDark(Math.max(Math.abs(dx), Math.abs(dy))));
        }
      }
    }
  }

  private drawFormat(modules: Uint8Array, errorCorrection: QrErrorCorrection, mask: number): void {
    const data = (FORMAT_LEVEL_BITS[errorCorrection] << 3) | mask;
    const bits = ((data << 10) | bchRemainder(data, FORMAT_GENERATOR, 10)) ^ FORMAT_MASK;
    const bitAt = (index: number) => ((bits >> index) & 1) === 1;
    for (let index = 0; index <= 5; index++) {
      this.set(modules, 8, index, bitAt(index));
    }
    this.set(modules, 8, 7, bitAt(6));
    this.set(modules, 8, 8, bitAt(7));
    this.set(modules, 7, 8, bitAt(8));
    for (let index = 9; index < 15; index++) {
      this.set(modules, 14 - index, 8, bitAt(index));
    }
    for (let index = 0; index < 8; index++) {
      this.set(modules, this.size - 1 - index, 8, bitAt(index));
    }
    for (let index = 8; index < 15; index++) {
      this.set(modules, 8, this.size - 15 + index, bitAt(index));
    }
    this.set(modules, 8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < FIRST_VERSION_WITH_VERSION_BITS) {
      return;
    }
    const bits = (this.version << 12) | bchRemainder(this.version, VERSION_GENERATOR, 12);
    for (let index = 0; index < 18; index++) {
      const dark = ((bits >> index) & 1) === 1;
      const near = Math.floor(index / 3);
      const far = this.size - 11 + (index % 3);
      this.set(this.functionPattern, far, near, dark);
      this.set(this.functionPattern, near, far, dark);
    }
  }

  private set(modules: Uint8Array, column: number, row: number, dark: boolean): void {
    modules[row * this.size + column] = dark ? 1 : 0;
    this.functionModules[row * this.size + column] = 1;
  }
}

function bchRemainder(data: number, generator: number, degree: number): number {
  let value = data;
  for (let step = 0; step < degree; step++) {
    value = (value << 1) ^ ((value >> (degree - 1)) * generator);
  }
  return value & ((1 << degree) - 1);
}

function maskPenalty(modules: Uint8Array, size: number): number {
  const at = (column: number, row: number) => modules[row * size + column];
  return (
    runPenalty(size, at) +
    runPenalty(size, (column, row) => at(row, column)) +
    blockPenalty(size, at) +
    finderLikePenalty(size, at) +
    finderLikePenalty(size, (column, row) => at(row, column)) +
    balancePenalty(modules)
  );
}

function runPenalty(size: number, at: (column: number, row: number) => number): number {
  let penalty = 0;
  for (let row = 0; row < size; row++) {
    let run = 0;
    let previous = -1;
    for (let column = 0; column < size; column++) {
      const module = at(column, row);
      if (module === previous) {
        run++;
      } else {
        penalty += runCost(run);
        run = 1;
        previous = module;
      }
    }
    penalty += runCost(run);
  }
  return penalty;
}

function runCost(run: number): number {
  return run >= SHORTEST_PENALISED_RUN ? RUN_PENALTY + run - SHORTEST_PENALISED_RUN : 0;
}

function blockPenalty(size: number, at: (column: number, row: number) => number): number {
  let blocks = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let column = 0; column < size - 1; column++) {
      const module = at(column, row);
      if (
        module === at(column + 1, row) &&
        module === at(column, row + 1) &&
        module === at(column + 1, row + 1)
      ) {
        blocks++;
      }
    }
  }
  return blocks * BLOCK_PENALTY;
}

function finderLikePenalty(size: number, at: (column: number, row: number) => number): number {
  const isLight = (row: number, from: number, to: number) => {
    if (from < 0 || to > size) {
      return false;
    }
    for (let column = from; column < to; column++) {
      if (at(column, row) === 1) {
        return false;
      }
    }
    return true;
  };
  let found = 0;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column + FINDER_LIKE.length - 1 < size; column++) {
      if (
        FINDER_LIKE.every((module, offset) => at(column + offset, row) === module) &&
        (isLight(row, column - FINDER_LIKE_MARGIN, column) ||
          isLight(
            row,
            column + FINDER_LIKE.length,
            column + FINDER_LIKE.length + FINDER_LIKE_MARGIN,
          ))
      ) {
        found++;
      }
    }
  }
  return found * FINDER_LIKE_PENALTY;
}

function balancePenalty(modules: Uint8Array): number {
  const dark = modules.reduce((count, module) => count + module, 0);
  const total = modules.length;
  return Math.floor((Math.abs(dark * 2 - total) * 10) / total) * BALANCE_PENALTY;
}
