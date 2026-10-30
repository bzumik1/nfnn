#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './png-pixels.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCREENS_MANIFEST = 'regression/v2/screens/manifest.json';
const ADDITIONS_FOLDER = 'regression/v2/additions';
const usage = [
  'Usage: node scripts/screens-manifest.mjs <folder of PNGs> [manifest path] [where the PNGs are kept]',
  '       node scripts/screens-manifest.mjs --check <folder of PNGs> [manifest path]',
  '       node scripts/screens-manifest.mjs --add <folder of PNGs> <slice, whose spec patch is regression/v2/additions/<slice>.patch>',
].join('\n');
const argv = process.argv.slice(2);
const mode = ['--check', '--add'].includes(argv[0]) ? argv[0] : 'write';
const [screens, out, stored = screens] = mode === 'write' ? argv : argv.slice(1);
if (!screens || (mode === '--add' && !out)) {
  console.error(usage);
  process.exit(2);
}

function shot(folder, file) {
  const path = resolve(root, folder, file);
  const { width: imageWidth, height, rgba } = decodePng(readFileSync(path));
  const [, state, width] = file.match(/^(.+)-(\d+)\.png$/);
  const element = state.includes('--');
  if (!element && Number(width) !== imageWidth) {
    throw new Error(`${file} is ${imageWidth} px wide`);
  }
  return {
    state,
    width: Number(width),
    ...(element ? { imageWidth } : {}),
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

function digestProblems(listedShots, present) {
  return listedShots
    .filter((entry) => present.includes(entry.file))
    .filter((entry) => {
      const found = shot(screens, entry.file);
      return found.pixelsSha256 !== entry.pixelsSha256 || found.height !== entry.height;
    })
    .map(
      (entry) =>
        `${entry.state} at ${entry.width} px (${entry.file}) has other pixels than the manifest records`,
    );
}

function failOn(problems) {
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

if (mode === '--check') {
  const file = out ?? SCREENS_MANIFEST;
  const listedShots = JSON.parse(readFileSync(resolve(root, file), 'utf8')).shots;
  const listed = listedShots.map((entry) => entry.file).sort();
  const present = pngs(screens);
  failOn([
    ...listed.filter((file) => !present.includes(file)).map((file) => `${file} is missing`),
    ...present.filter((file) => !listed.includes(file)).map((file) => `${file} is not listed`),
    ...digestProblems(listedShots, present),
  ]);
  console.log(`${present.length} shots in ${screens} match ${file}`);
} else if (mode === '--add') {
  const slice = out;
  const patch = `${ADDITIONS_FOLDER}/${slice}.patch`;
  if (!/^[\w.-]+$/.test(slice) || !existsSync(resolve(root, patch))) {
    console.error(
      `the additions of ${slice} are recorded with the spec patch ${patch}; write it first (git diff <BASELINE_COMMIT> -- frontend/e2e/baseline)`,
    );
    process.exit(2);
  }
  const target = resolve(root, SCREENS_MANIFEST);
  const manifest = JSON.parse(readFileSync(target, 'utf8'));
  const listed = manifest.shots.map((entry) => entry.file);
  const present = pngs(screens);
  failOn([
    ...listed
      .filter((file) => !present.includes(file))
      .map((file) => `${file} is missing, so the recording cannot show it reproduces the baseline`),
    ...digestProblems(manifest.shots, present),
  ]);
  const shots = present
    .filter((file) => !listed.includes(file))
    .map((file) => ({ ...shot(screens, file), addedIn: slice }));
  if (shots.length === 0) {
    console.error(`${screens} has no shot that ${SCREENS_MANIFEST} does not list`);
    process.exit(1);
  }
  manifest.shots.push(...shots);
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `${listed.length} listed shots reproduced; ${shots.length} shots, ${shots.reduce((sum, entry) => sum + entry.bytes, 0)} bytes, appended to ${SCREENS_MANIFEST} as added in ${slice}`,
  );
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
  const target = resolve(root, out ?? SCREENS_MANIFEST);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${shots.length} shots, ${manifest.totalBytes} bytes, manifest ${target}`);
}
