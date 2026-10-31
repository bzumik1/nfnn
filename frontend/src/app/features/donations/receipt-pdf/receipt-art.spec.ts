import { receiptArt } from './receipt-art';
import {
  base64Bytes,
  SYNTHETIC_PORTRAIT_PNG_BASE64,
  SYNTHETIC_SIGNATURE_JSON,
} from './testing/synthetic-art';

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

describe('Given the bytes the server serves for a receipt image', () => {
  it('when a vector signature matches the digest the receipt names, then it is read as vector art', async () => {
    const bytes = new TextEncoder().encode(SYNTHETIC_SIGNATURE_JSON);

    const art = await receiptArt(
      { bytes: buffer(bytes), mediaType: 'application/json' },
      await sha256(bytes),
    );

    expect(art.kind).toBe('vector');
    expect(art.kind === 'vector' && art.art.viewBox).toEqual([0, 0, 240, 80]);
  });

  it('when a PNG matches the digest, then it is kept as raster bytes', async () => {
    const bytes = base64Bytes(SYNTHETIC_PORTRAIT_PNG_BASE64);

    const art = await receiptArt({ bytes: buffer(bytes), mediaType: 'image/png' }, await sha256(bytes));

    expect(art).toEqual({ kind: 'raster', bytes });
  });

  it('when the bytes do not match the digest the receipt names, then they are refused and never drawn', async () => {
    const bytes = base64Bytes(SYNTHETIC_PORTRAIT_PNG_BASE64);

    await expect(
      receiptArt({ bytes: buffer(bytes), mediaType: 'image/png' }, 'f'.repeat(64)),
    ).rejects.toThrow(/digest/);
  });

  it('when the media type is neither a PNG, a JPEG nor vector JSON, then it is refused', async () => {
    const bytes = new TextEncoder().encode('<svg/>');

    await expect(
      receiptArt({ bytes: buffer(bytes), mediaType: 'image/svg+xml' }, await sha256(bytes)),
    ).rejects.toThrow(/image\/svg\+xml/);
  });
});
