import jsQR from 'jsqr';

import type { QrImage } from './qr-image';

export function decodedQrText(image: QrImage): string | null {
  return (
    jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  );
}
