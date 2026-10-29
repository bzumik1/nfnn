#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const usage = [
  'Usage: node scripts/screens-manifest.mjs <folder of PNGs> [manifest path] [where the PNGs are kept]',
  '       node scripts/screens-manifest.mjs --check <folder of PNGs> [manifest path]',
].join('\n');
const argv = process.argv.slice(2);
const checking = argv[0] === '--check';
const [screens, out = 'regression/v2/screens/manifest.json', stored = screens] = checking
  ? argv.slice(1)
  : argv;
if (!screens) {
  console.error(usage);
  process.exit(2);
}

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

function decode(png) {
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

function shot(folder, file) {
  const path = resolve(root, folder, file);
  const { width: imageWidth, height, rgba } = decode(readFileSync(path));
  const [, state, width] = file.match(/^(.+)-(\d+)\.png$/);
  if (Number(width) !== imageWidth) {
    throw new Error(`${file} is ${imageWidth} px wide`);
  }
  return {
    state,
    width: Number(width),
    height,
    file,
    bytes: statSync(path).size,
    pixelsSha256: createHash('sha256').update(rgba).digest('hex'),
  };
}

const pngs = (folder) =>
  readdirSync(resolve(root, folder))
    .filter((name) => name.endsWith('.png'))
    .sort();

if (checking) {
  const manifest = JSON.parse(readFileSync(resolve(root, out), 'utf8'));
  const listed = manifest.shots.map((entry) => entry.file).sort();
  const present = pngs(screens);
  const problems = [
    ...listed.filter((file) => !present.includes(file)).map((file) => `${file} is missing`),
    ...present.filter((file) => !listed.includes(file)).map((file) => `${file} is not listed`),
  ];
  for (const entry of manifest.shots.filter((listedShot) => present.includes(listedShot.file))) {
    const found = shot(screens, entry.file);
    if (found.pixelsSha256 !== entry.pixelsSha256 || found.height !== entry.height) {
      problems.push(`${entry.file} has other pixels than the manifest records`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`${present.length} shots in ${screens} match ${out}`);
} else {
  const shots = pngs(screens).map((file) => shot(screens, file));
  const manifest = {
    source: 'v2-baseline',
    logic:
      'Screenshots of frontend/e2e/baseline/screens.spec.ts, of the whole page or, for a dialog, of the viewport (Playwright Chromium, the e2e API mocks, clock fixed at 2026-10-28T09:00:00Z, cs-CZ, Europe/Prague, reduced motion, animations off) at 390 and 1280 px wide, 900 px viewport height; a later run matches within 0.2 % of pixels. The PNGs are kept outside the repository, in `stored`. pixelsSha256 is the SHA-256 of the decoded pixels (8-bit RGBA, row by row), so a chunk a file store adds does not change it; bytes is the size as recorded. The digests hold on the recording machine; another browser build renders other pixels, so a differing digest means comparing pixels (testing.md), never recording again.',
    stored,
    totalBytes: shots.reduce((sum, entry) => sum + entry.bytes, 0),
    shots,
  };
  const target = resolve(root, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${shots.length} shots, ${manifest.totalBytes} bytes, manifest ${out}`);
}
