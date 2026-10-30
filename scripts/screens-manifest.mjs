#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './png-pixels.mjs';

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

function shot(folder, file) {
  const path = resolve(root, folder, file);
  const { width: imageWidth, height, rgba } = decodePng(readFileSync(path));
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
      problems.push(
        `${entry.state} at ${entry.width} px (${entry.file}) has other pixels than the manifest records`,
      );
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
      'Screenshots of frontend/e2e/baseline/screens.spec.ts, of the whole page or, for a dialog, of the viewport (Playwright Chromium, the e2e API mocks, clock fixed at 2026-10-28T09:00:00Z, cs-CZ, Europe/Prague, reduced motion, animations off) at 390 and 1280 px wide, 900 px viewport height; a second recording on the same machine gives the same pixels, which the recording script checks, and a comparison run (testing.md) accepts up to 0.2 % of pixels. The PNGs are kept outside the repository, in `stored`. pixelsSha256 is the SHA-256 of the decoded pixels (8-bit RGBA, row by row), so a chunk a file store adds does not change it; bytes is the size as recorded. The digests hold on the recording machine; another browser build renders other pixels, so a differing digest means comparing pixels (testing.md), never recording again.',
    stored,
    totalBytes: shots.reduce((sum, entry) => sum + entry.bytes, 0),
    shots,
  };
  const target = resolve(root, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${shots.length} shots, ${manifest.totalBytes} bytes, manifest ${out}`);
}
