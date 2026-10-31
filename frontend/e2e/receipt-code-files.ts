import { deflateSync } from 'node:zlib';
import { encodeText } from '../src/app/shared/ui/qr-code/qr-encoder';
import {
  VERIFICATION_ADDRESS,
  verificationSymbol,
} from '../src/app/features/donations/receipt-pdf/verification-qr';

const QUIET_ZONE = 4;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function qrCodePng(qrText: string, pixelsPerModule = 6): Buffer {
  const symbol = qrText.startsWith(VERIFICATION_ADDRESS)
    ? verificationSymbol(qrText)
    : encodeText(qrText, 'M');
  const side = (symbol.size + 2 * QUIET_ZONE) * pixelsPerModule;
  const rows: Buffer[] = [];
  for (let y = 0; y < side; y++) {
    const row = Buffer.alloc(side + 1, 0xff);
    row[0] = 0;
    const moduleRow = Math.floor(y / pixelsPerModule) - QUIET_ZONE;
    for (let x = 0; x < side; x++) {
      const moduleColumn = Math.floor(x / pixelsPerModule) - QUIET_ZONE;
      const inside =
        moduleRow >= 0 &&
        moduleColumn >= 0 &&
        moduleRow < symbol.size &&
        moduleColumn < symbol.size;
      if (inside && symbol.modules.charAt(moduleRow * symbol.size + moduleColumn) === '1') {
        row[x + 1] = 0;
      }
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([8, 0, 0, 0, 0], 8);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function pdfWithLink(uri: string): Buffer {
  return Buffer.from(
    [
      '%PDF-1.7',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [4 0 R] >> endobj',
      `4 0 obj << /Type /Annot /Subtype /Link /Rect [40 40 200 200] /A << /S /URI /URI (${uri}) >> >> endobj`,
      'trailer << /Root 1 0 R >>',
      '%%EOF',
    ].join('\n'),
    'latin1',
  );
}

export function pngDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

export function fakeCameraShowing(dataUrl: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const image = new Image();
  image.src = dataUrl;
  const paint = (): void => {
    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (image.complete && image.naturalWidth > 0) {
      const side = Math.min(canvas.height - 40, image.naturalWidth);
      context.drawImage(image, (canvas.width - side) / 2, 20, side, side);
    }
  };
  setInterval(paint, 100);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () => {
        paint();
        return Promise.resolve(canvas.captureStream(10));
      },
    },
  });
}
