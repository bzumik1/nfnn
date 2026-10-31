import { inject } from 'vitest';

export interface V2ReceiptLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface V2ReceiptSample {
  readonly sample: string;
  readonly description: string;
  readonly pdf: { readonly pageCount: number; readonly fonts: readonly string[] };
  readonly pages: readonly {
    readonly number: number;
    readonly widthPt: number;
    readonly heightPt: number;
    readonly lines: readonly V2ReceiptLine[];
  }[];
}

export interface ReceiptAssetLibrary {
  readonly fonts: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly v2Receipts: Readonly<Record<string, V2ReceiptSample>>;
  readonly logoSvg: string;
}

declare module 'vitest' {
  interface ProvidedContext {
    receiptAssets: ReceiptAssetLibrary;
  }
}

export type ReceiptFontName = 'body' | 'body-bold' | 'heading';

export function themeFont(theme: string, name: ReceiptFontName): Uint8Array {
  const encoded = inject('receiptAssets').fonts[theme]?.[name];
  if (encoded === undefined) {
    throw new Error(`The theme ${theme} has no receipt font ${name}`);
  }
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

export function v2Receipt(sample: string): V2ReceiptSample {
  const receipt = inject('receiptAssets').v2Receipts[sample];
  if (receipt === undefined) {
    throw new Error(`regression/v2/receipts/${sample}.json is missing`);
  }
  return receipt;
}

export function logoSvg(): string {
  return inject('receiptAssets').logoSvg;
}
