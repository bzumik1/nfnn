export interface PrintedText {
  readonly text: string;
  readonly outside: readonly number[];
}

export type CodePointRange = readonly [first: number, last: number];

export const RECEIPT_PRINTABLE_RANGES: readonly CodePointRange[] = [
  [0x0020, 0x007e],
  [0x00a0, 0x00ac],
  [0x00ae, 0x0148],
  [0x014a, 0x01c3],
  [0x01c5, 0x024f],
  [0x0259, 0x0259],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c7],
  [0x02da, 0x02da],
  [0x02dc, 0x02dd],
  [0x0375, 0x0376],
  [0x037a, 0x037f],
  [0x0384, 0x038a],
  [0x038c, 0x038c],
  [0x038e, 0x03a1],
  [0x03a3, 0x03d7],
  [0x03dc, 0x03dd],
  [0x03f0, 0x03f6],
  [0x03f9, 0x03fa],
  [0x03fc, 0x0479],
  [0x0480, 0x0482],
  [0x048a, 0x049d],
  [0x04a0, 0x04ff],
  [0x1e00, 0x1e9b],
  [0x1e9d, 0x1efb],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2020, 0x2020],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x2032, 0x2033],
  [0x2039, 0x203a],
  [0x20ac, 0x20ac],
  [0x2116, 0x2116],
  [0x2122, 0x2122],
  [0x2212, 0x2212],
];

export const RECEIPT_DROPPED_RANGES: readonly CodePointRange[] = [
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfeff, 0xfeff],
];

function within(ranges: readonly CodePointRange[], codePoint: number): boolean {
  return ranges.some(([first, last]) => codePoint >= first && codePoint <= last);
}

function codePointOf(character: string): number {
  return character.codePointAt(0) ?? 0;
}

export function printedText(raw: string): PrintedText {
  const text = Array.from(raw)
    .filter((character) => !within(RECEIPT_DROPPED_RANGES, codePointOf(character)))
    .join('')
    .normalize('NFC');
  const outside = new Set<number>();
  for (const character of text) {
    const codePoint = codePointOf(character);
    if (!within(RECEIPT_PRINTABLE_RANGES, codePoint)) {
      outside.add(codePoint);
    }
  }
  return { text, outside: [...outside] };
}
