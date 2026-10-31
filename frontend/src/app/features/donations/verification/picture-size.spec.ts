import { pictureSize } from './picture-size';

function bytes(...parts: (number[] | string)[]): Uint8Array {
  return new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string' ? Array.from(part, (character) => character.charCodeAt(0)) : part,
    ),
  );
}

function u16be(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u24le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
}

function png(width: number, height: number): Uint8Array {
  return bytes(
    [0x89],
    'PNG\r\n\x1a\n',
    u32be(13),
    'IHDR',
    u32be(width),
    u32be(height),
    [8, 6, 0, 0, 0],
    u32be(0),
  );
}

function segment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...u16be(payload.length + 2), ...payload];
}

function jpeg(width: number, height: number, before: number[][] = []): Uint8Array {
  return bytes(
    [0xff, 0xd8],
    ...before,
    segment(
      0xe0,
      Array.from('JFIF\0', (character) => character.charCodeAt(0)),
    ),
    segment(0xc2, [8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    [0xff, 0xda],
  );
}

function webp(chunk: string, payload: number[]): Uint8Array {
  return bytes(
    'RIFF',
    u32le(4 + 8 + payload.length),
    'WEBP',
    chunk,
    u32le(payload.length),
    payload,
  );
}

describe('Given the first bytes of a picture file', () => {
  it('when it is a PNG, then it gives the size from its header', () => {
    expect(pictureSize(png(1_200, 900))).toEqual({ width: 1_200, height: 900 });
  });

  it('when it is a JPEG with metadata before the frame, then it gives the size from its frame header', () => {
    const exif = segment(0xe1, new Array<number>(30_000).fill(0));

    expect(pictureSize(jpeg(4_032, 3_024, [exif]))).toEqual({ width: 4_032, height: 3_024 });
  });

  it('when it is a GIF, then it gives the size from its screen descriptor', () => {
    expect(pictureSize(bytes('GIF89a', u16le(640), u16le(480), [0, 0, 0]))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('when it is a lossy WebP, then it gives the size from its frame', () => {
    const frame = [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(800), ...u16le(600)];

    expect(pictureSize(webp('VP8 ', frame))).toEqual({ width: 800, height: 600 });
  });

  it('when it is a lossless WebP, then it gives the size from its header', () => {
    const packed = (800 - 1) | ((600 - 1) << 14);

    expect(pictureSize(webp('VP8L', [0x2f, ...u32le(packed)]))).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('when it is an extended WebP, then it gives the size of its canvas', () => {
    const header = [0, 0, 0, 0, ...u24le(10_000 - 1), ...u24le(8_000 - 1)];

    expect(pictureSize(webp('VP8X', header))).toEqual({ width: 10_000, height: 8_000 });
  });

  for (const [name, file] of [
    ['empty', new Uint8Array(0)],
    ['plain text', bytes('just some text')],
    ['a PNG cut off before its size', png(10, 10).slice(0, 20)],
    ['a JPEG without a frame header', bytes([0xff, 0xd8], segment(0xe0, [0, 0, 0]), [0xff, 0xd9])],
    ['a JPEG whose segment runs past the end', bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0, 0])],
    ['a PNG of zero width', png(0, 10)],
  ] as const) {
    it(`when it is ${name}, then it gives nothing`, () => {
      expect(pictureSize(file)).toBeNull();
    });
  }
});
