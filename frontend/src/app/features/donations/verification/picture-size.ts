export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_FRAMES = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const JPEG_STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);
const JPEG_SCAN = 0xda;
const JPEG_END = 0xd9;
const VP8_START = [0x9d, 0x01, 0x2a];
const VP8L_SIGNATURE = 0x2f;

export function pictureSize(bytes: Uint8Array): PictureSize | null {
  const size = pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
  return size !== null && size.width > 0 && size.height > 0 ? size : null;
}

function pngSize(bytes: Uint8Array): PictureSize | null {
  if (!startsWith(bytes, 0, PNG_SIGNATURE) || ascii(bytes, 12, 4) !== 'IHDR' || bytes.length < 24) {
    return null;
  }
  return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

function jpegSize(bytes: Uint8Array): PictureSize | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (JPEG_STANDALONE.has(marker)) {
      at += 2;
      continue;
    }
    if (marker === JPEG_SCAN || marker === JPEG_END) {
      return null;
    }
    const length = u16be(bytes, at + 2);
    if (length < 2 || at + 2 + length > bytes.length) {
      return null;
    }
    if (JPEG_FRAMES.has(marker)) {
      return length < 7 ? null : { width: u16be(bytes, at + 7), height: u16be(bytes, at + 5) };
    }
    at += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array): PictureSize | null {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }
  const chunk = ascii(bytes, 12, 4);
  const data = 20;
  if (chunk === 'VP8 ' && bytes.length >= data + 10 && startsWith(bytes, data + 3, VP8_START)) {
    return { width: u16le(bytes, data + 6) & 0x3fff, height: u16le(bytes, data + 8) & 0x3fff };
  }
  if (chunk === 'VP8L' && bytes.length >= data + 5 && bytes[data] === VP8L_SIGNATURE) {
    const packed = u32le(bytes, data + 1);
    return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X' && bytes.length >= data + 10) {
    return { width: u24le(bytes, data + 4) + 1, height: u24le(bytes, data + 7) + 1 };
  }
  return null;
}

function startsWith(bytes: Uint8Array, at: number, expected: readonly number[]): boolean {
  return expected.every((byte, index) => bytes[at + index] === byte);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1];
}

function u32be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function u16le(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8);
}

function u24le(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
}

function u32le(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}
