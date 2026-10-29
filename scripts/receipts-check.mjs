#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './png-pixels.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [folder, digestsPath = 'regression/v2/receipts/digests.json'] = process.argv.slice(2);
if (!folder) {
  console.error(
    'Usage: node scripts/receipts-check.mjs <folder of rendered receipts> [digests.json]',
  );
  process.exit(2);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function rasterDigest(file) {
  const { width, height, rgba } = decodePng(readFileSync(file));
  const rgb = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgba.copy(rgb, pixel * 4 + 1, pixel * 4, pixel * 4 + 3);
  }
  return { width, height, digest: sha256(rgb) };
}

const digests = JSON.parse(readFileSync(resolve(root, digestsPath), 'utf8'));
const expected = digests.samples.flatMap((sample) => [
  `${sample.sample}.pdf`,
  ...sample.pages.map((page) => `${sample.sample}-${page.number}.png`),
]);
const present = readdirSync(resolve(root, folder)).sort();
const problems = [
  ...expected.filter((file) => !present.includes(file)).map((file) => `${file} is missing`),
  ...present.filter((file) => !expected.includes(file)).map((file) => `${file} is not listed`),
];
for (const sample of digests.samples) {
  const pdf = resolve(root, folder, `${sample.sample}.pdf`);
  if (present.includes(`${sample.sample}.pdf`) && sha256(readFileSync(pdf)) !== sample.pdfSha256) {
    problems.push(`${sample.sample}.pdf has other bytes than ${digestsPath} records`);
  }
  for (const page of sample.pages) {
    const file = `${sample.sample}-${page.number}.png`;
    if (!present.includes(file)) {
      continue;
    }
    const raster = rasterDigest(resolve(root, folder, file));
    if (
      raster.digest !== page.rgbSha256 ||
      raster.width !== page.width ||
      raster.height !== page.height
    ) {
      problems.push(`${file} has other pixels than ${digestsPath} records`);
    }
  }
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`${present.length} rendered receipt files in ${folder} match ${digestsPath}`);
