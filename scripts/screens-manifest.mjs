#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [screens, out = 'regression/v2/screens/manifest.json', stored = screens] = process.argv.slice(2);
if (!screens) {
  console.error('Usage: node scripts/screens-manifest.mjs <folder of PNGs> [manifest path] [where the PNGs are kept]');
  process.exit(2);
}

const shots = readdirSync(resolve(root, screens))
  .filter((name) => name.endsWith('.png'))
  .sort()
  .map((file) => {
    const png = readFileSync(resolve(root, screens, file));
    const [, state, width] = file.match(/^(.+)-(\d+)\.png$/);
    return {
      state,
      width: Number(width),
      height: png.readUInt32BE(20),
      file,
      bytes: png.length,
      sha256: createHash('sha256').update(png).digest('hex'),
    };
  });

const manifest = {
  source: 'v2-baseline',
  logic:
    'Screenshots of frontend/e2e/baseline/screens.spec.ts, of the whole page or, for a dialog, of the viewport (Playwright Chromium, the e2e API mocks, clock fixed at 2026-10-28T09:00:00Z, cs-CZ, Europe/Prague, reduced motion, animations off) at 390 and 1280 px wide, 900 px viewport height; a later run matches within 0.2 % of pixels. The PNGs are kept outside the repository, in `stored`; the digests are of those files and differ between machines, so compare pixels, not digests, on another runner.',
  stored,
  totalBytes: shots.reduce((sum, shot) => sum + shot.bytes, 0),
  shots,
};

const target = resolve(root, out);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${shots.length} shots, ${manifest.totalBytes} bytes, manifest ${out}`);
