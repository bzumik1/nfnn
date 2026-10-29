import { inflateSync } from 'node:zlib';

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function chunks(png) {
  const signature = '89504e470d0a1a0a';
  if (png.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('not a PNG');
  }
  const found = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    found.push({
      type: png.toString('latin1', offset + 4, offset + 8),
      data: png.subarray(offset + 8, offset + 8 + length),
    });
    offset += length + 12;
  }
  return found;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
}

export function decodePng(png) {
  const all = chunks(png);
  const header = all.find((chunk) => chunk.type === 'IHDR').data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [depth, colourType, , , interlace] = header.subarray(8, 13);
  const channels = CHANNELS[colourType];
  if (depth !== 8 || channels === undefined || interlace !== 0) {
    throw new Error(
      `unsupported PNG: depth ${depth}, colour type ${colourType}, interlace ${interlace}`,
    );
  }
  const filtered = inflateSync(
    Buffer.concat(all.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)),
  );
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row++) {
    const filter = filtered[row * (stride + 1)];
    const source = filtered.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const line = pixels.subarray(row * stride, (row + 1) * stride);
    const previous =
      row > 0 ? pixels.subarray((row - 1) * stride, row * stride) : Buffer.alloc(stride);
    for (let index = 0; index < stride; index++) {
      const left = index >= channels ? line[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      if (predictor === undefined) {
        throw new Error(`unknown PNG filter ${filter}`);
      }
      line[index] = (source[index] + predictor) & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const at = pixel * channels;
    const [red, green, blue, alpha] =
      channels === 4
        ? [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]]
        : channels === 3
          ? [pixels[at], pixels[at + 1], pixels[at + 2], 255]
          : channels === 2
            ? [pixels[at], pixels[at], pixels[at], pixels[at + 1]]
            : [pixels[at], pixels[at], pixels[at], 255];
    rgba.writeUInt32BE(((red << 24) | (green << 16) | (blue << 8) | alpha) >>> 0, pixel * 4);
  }
  return { width, height, rgba };
}
