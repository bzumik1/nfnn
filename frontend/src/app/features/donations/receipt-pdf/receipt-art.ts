import { ReceiptImageBytes } from './receipts-api';
import { VectorArt } from './vector-art';

export type ReceiptArt =
  | { readonly kind: 'vector'; readonly art: VectorArt }
  | { readonly kind: 'raster'; readonly bytes: Uint8Array };

export async function receiptArt(image: ReceiptImageBytes, sha256: string): Promise<ReceiptArt> {
  throw new Error(`not implemented ${image.mediaType} ${sha256}`);
}
