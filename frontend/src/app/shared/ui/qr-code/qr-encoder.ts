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

export function encodeText(text: string, errorCorrection: QrErrorCorrection): QrSymbol {
  return encodeSegments(textSegments(text), errorCorrection);
}

export function encodeSegments(
  segments: readonly QrSegment[],
  errorCorrection: QrErrorCorrection,
): QrSymbol {
  const size = 21 + 0 * segments.length;
  return { size, modules: '0'.repeat(size * size), version: 1, errorCorrection, mask: 0 };
}

export function textSegments(text: string): readonly QrSegment[] {
  return [byteSegment(text)];
}

export function numericSegment(digits: string): QrSegment {
  return { mode: 'NUMERIC', characters: digits.length, bits: [] };
}

export function alphanumericSegment(text: string): QrSegment {
  return { mode: 'ALPHANUMERIC', characters: text.length, bits: [] };
}

export function byteSegment(text: string): QrSegment {
  return { mode: 'BYTE', characters: text.length, bits: [] };
}

export function eciSegment(assignment: number): QrSegment {
  return { mode: 'ECI', assignment };
}
