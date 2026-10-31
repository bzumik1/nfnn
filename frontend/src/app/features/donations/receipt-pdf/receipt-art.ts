import { ReceiptImageBytes } from './receipts-api';
import { parseVectorArt, VectorArt } from './vector-art';

export type ReceiptArt =
  | { readonly kind: 'vector'; readonly art: VectorArt }
  | { readonly kind: 'raster'; readonly bytes: Uint8Array };

const RASTER_TYPES: readonly string[] = ['image/png', 'image/jpeg'];
const VECTOR_TYPE = 'application/json';

async function hexDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function receiptArt(image: ReceiptImageBytes, sha256: string): Promise<ReceiptArt> {
  if (image.mediaType !== VECTOR_TYPE && !RASTER_TYPES.includes(image.mediaType)) {
    throw new Error(`A receipt image of the type ${image.mediaType} cannot be drawn.`);
  }
  const bytes = new Uint8Array(image.bytes);
  if ((await hexDigest(bytes)) !== sha256) {
    throw new Error('The receipt image does not match the digest its receipt names.');
  }
  return image.mediaType === VECTOR_TYPE
    ? { kind: 'vector', art: parseVectorArt(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    : { kind: 'raster', bytes };
}
