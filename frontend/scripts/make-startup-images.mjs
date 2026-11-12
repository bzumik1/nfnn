import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

import { rasterizeSvg } from './svg-raster.mjs';

export const STARTUP_SCREENS = [
  { width: 375, height: 667, scale: 2 },
  { width: 414, height: 736, scale: 3 },
  { width: 375, height: 812, scale: 3 },
  { width: 414, height: 896, scale: 2 },
  { width: 414, height: 896, scale: 3 },
  { width: 390, height: 844, scale: 3 },
  { width: 428, height: 926, scale: 3 },
  { width: 393, height: 852, scale: 3 },
  { width: 430, height: 932, scale: 3 },
  { width: 402, height: 874, scale: 3 },
  { width: 420, height: 912, scale: 3 },
  { width: 440, height: 956, scale: 3 },
  { width: 744, height: 1133, scale: 2 },
  { width: 768, height: 1024, scale: 2 },
  { width: 810, height: 1080, scale: 2 },
  { width: 820, height: 1180, scale: 2 },
  { width: 834, height: 1112, scale: 2 },
  { width: 834, height: 1194, scale: 2 },
  { width: 834, height: 1210, scale: 2 },
  { width: 1024, height: 1366, scale: 2 },
  { width: 1032, height: 1376, scale: 2 },
];

const FOLDER = 'startup';
const ICON = 'launch-icon.svg';
const MANIFEST = 'manifest.webmanifest';
const ICON_SIZE_TOKEN = '--launch-icon-size';
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const APPEARANCES = [
  { appearance: 'light', suffix: '', query: '' },
  { appearance: 'dark', suffix: '-dark', query: ' and (prefers-color-scheme: dark)' },
];

export function startupImages() {
  return APPEARANCES.flatMap(({ appearance, suffix, query: appearanceQuery }) =>
    STARTUP_SCREENS.flatMap(({ width, height, scale }) => {
      const query = `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale})`;
      const portrait = { width: width * scale, height: height * scale, scale };
      const landscape = { width: height * scale, height: width * scale, scale };
      return [
        { ...portrait, orientation: 'portrait' },
        { ...landscape, orientation: 'landscape' },
      ].map((image) => ({
        ...image,
        appearance,
        href: `${FOLDER}/${image.width}x${image.height}${suffix}.png`,
        media: `${query} and (orientation: ${image.orientation})${appearanceQuery}`,
      }));
    }),
  );
}

function chunks(png) {
  if (!png.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
    throw new Error('not a PNG file');
  }
  const found = [];
  for (let at = SIGNATURE.length; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    found.push({ type, data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
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
  const header = all.find(({ type }) => type === 'IHDR').data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colourType = header[9];
  const interlace = header[12];
  if (depth !== 8 || (colourType !== 2 && colourType !== 6) || interlace !== 0) {
    throw new Error(
      `only 8-bit RGB or RGBA PNGs without interlacing are read, this one has depth ${depth}, colour type ${colourType}, interlace ${interlace}`,
    );
  }
  const channels = colourType === 6 ? 4 : 3;
  const rowLength = width * channels;
  const filtered = inflateSync(
    Buffer.concat(all.filter(({ type }) => type === 'IDAT').map(({ data }) => data)),
  );
  const pixels = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (rowLength + 1)];
    const source = y * (rowLength + 1) + 1;
    const row = y * rowLength;
    for (let x = 0; x < rowLength; x++) {
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[row - rowLength + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[row - rowLength + x - channels] : 0;
      const predictors = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)];
      pixels[row + x] = (filtered[source + x] + predictors[filter]) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

export function encodePng({ width, height, channels, pixels }) {
  const rowLength = width * channels;
  const filtered = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y++) {
    const target = y * (rowLength + 1);
    const row = y * rowLength;
    filtered[target] = y === 0 ? 0 : 2;
    if (y > 0 && pixels.compare(pixels, row - rowLength, row, row, row + rowLength) === 0) {
      continue;
    }
    for (let x = 0; x < rowLength; x++) {
      const up = y > 0 ? pixels[row - rowLength + x] : 0;
      filtered[target + 1 + x] = (pixels[row + x] - up) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function spans(sourceSize, targetSize) {
  const ratio = sourceSize / targetSize;
  return Array.from({ length: targetSize }, (_, target) => {
    const start = target * ratio;
    const end = start + ratio;
    const covered = [];
    for (let source = Math.floor(start); source < Math.ceil(end); source++) {
      const weight = Math.min(end, source + 1) - Math.max(start, source);
      if (weight > 0) {
        covered.push({ source, weight: weight / ratio });
      }
    }
    return covered;
  });
}

function scaledIcon(icon, size) {
  const columns = spans(icon.width, size);
  const rows = spans(icon.height, size);
  const scaled = new Float64Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (const row of rows[y]) {
        for (const column of columns[x]) {
          const at = (row.source * icon.width + column.source) * icon.channels;
          const weight = row.weight * column.weight;
          const alpha = icon.channels === 4 ? icon.pixels[at + 3] / 255 : 1;
          sum[0] += icon.pixels[at] * alpha * weight;
          sum[1] += icon.pixels[at + 1] * alpha * weight;
          sum[2] += icon.pixels[at + 2] * alpha * weight;
          sum[3] += alpha * weight;
        }
      }
      scaled.set(sum, (y * size + x) * 4);
    }
  }
  return scaled;
}

export function drawLaunchImage({ icon, background, width, height, iconSize }) {
  const pixels = Buffer.alloc(width * height * 3, Buffer.from(background));
  const scaled = scaledIcon(icon, iconSize);
  const left = Math.round((width - iconSize) / 2);
  const top = Math.round((height - iconSize) / 2);
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const from = (y * iconSize + x) * 4;
      const to = ((top + y) * width + left + x) * 3;
      const coverage = scaled[from + 3];
      for (let channel = 0; channel < 3; channel++) {
        const value = scaled[from + channel] + background[channel] * (1 - coverage);
        pixels[to + channel] = Math.min(255, Math.max(0, Math.round(value)));
      }
    }
  }
  return { width, height, channels: 3, pixels };
}

function hexColour(colour, source) {
  const match = /^#([0-9a-f]{6})$/i.exec(colour ?? '');
  if (!match) {
    throw new Error(`${source} names no #rrggbb (found ${colour})`);
  }
  return [0, 2, 4].map((at) => parseInt(match[1].slice(at, at + 2), 16));
}

function builtStyles(browser) {
  return readdirSync(browser)
    .filter((name) => /^styles-.*\.css$/.test(name))
    .map((name) => readFileSync(join(browser, name), 'utf8'))
    .join('\n');
}

function launchIconPoints(styles) {
  const size = new RegExp(`${ICON_SIZE_TOKEN}:\\s*(\\d+)px`).exec(styles);
  if (!size) {
    throw new Error(
      `the built stylesheet sets no ${ICON_SIZE_TOKEN} in px, which the launch images take`,
    );
  }
  return Number(size[1]);
}

function darkSurface(styles) {
  const block = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(styles);
  const surface = block && /--color-surface:\s*([^;}\s]+)/.exec(block[1]);
  if (!surface) {
    throw new Error(
      'the built stylesheet sets no --color-surface under @media (prefers-color-scheme: dark), which the dark launch images take',
    );
  }
  return hexColour(surface[1], 'the dark --color-surface');
}

export function makeStartupImages(browser) {
  if (!existsSync(join(browser, MANIFEST)) || !existsSync(join(browser, ICON))) {
    return [];
  }
  const styles = builtStyles(browser);
  const points = launchIconPoints(styles);
  const backgrounds = {
    light: hexColour(
      JSON.parse(readFileSync(join(browser, MANIFEST), 'utf8')).background_color,
      `the background_color of ${MANIFEST}`,
    ),
    dark: darkSurface(styles),
  };
  const svg = readFileSync(join(browser, ICON), 'utf8');
  const icons = new Map();
  const iconAt = (size) => {
    if (!icons.has(size)) {
      icons.set(size, rasterizeSvg(svg, { width: size, height: size }));
    }
    return icons.get(size);
  };
  mkdirSync(join(browser, FOLDER), { recursive: true });
  return startupImages().map(({ href, width, height, scale, appearance }) => {
    const iconSize = points * scale;
    const image = drawLaunchImage({
      icon: iconAt(iconSize),
      background: backgrounds[appearance],
      width,
      height,
      iconSize,
    });
    const file = join(browser, href);
    writeFileSync(file, encodePng(image));
    return file;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  const browsers = existsSync(dist)
    ? readdirSync(dist, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(dist, entry.name, 'browser'))
    : [];
  for (const browser of browsers) {
    const made = makeStartupImages(browser);
    if (made.length > 0) {
      console.log(`${made.length} launch images written to ${join(browser, FOLDER)}`);
    }
  }
}
