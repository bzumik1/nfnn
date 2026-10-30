import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodePng } from './compare-screens.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(root, 'scripts/screens-manifest.mjs');
const MANIFEST = join(root, 'regression/v2/screens/manifest.json');

function shot(folder, file, shade) {
  const rgba = Buffer.alloc(390 * 2 * 4, shade);
  writeFileSync(join(folder, file), encodePng({ width: 390, height: 2, rgba }));
}

function recording(shade) {
  const folder = mkdtempSync(join(tmpdir(), 'screens-manifest-'));
  mkdirSync(folder, { recursive: true });
  shot(folder, 'only-in-this-test-390.png', shade);
  return folder;
}

function add(...args) {
  return spawnSync(process.execPath, [SCRIPT, '--add', ...args], { encoding: 'utf8' });
}

describe('Given two recordings of the additions', () => {
  it('when one is given alone, then it is refused, since only two runs show the pixels are stable', () => {
    const before = readFileSync(MANIFEST, 'utf8');

    const result = add(recording(255), '0.6c');

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage/);
    assert.equal(readFileSync(MANIFEST, 'utf8'), before);
  });

  it('when the second run has other pixels than the first, then it names the shot and changes nothing', () => {
    const before = readFileSync(MANIFEST, 'utf8');

    const result = add(recording(255), recording(254), '0.6c');

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /only-in-this-test-390\.png differs between the two recordings, so it is not stable enough to add/,
    );
    assert.equal(readFileSync(MANIFEST, 'utf8'), before);
  });

  it('when the second run lacks a shot of the first, then it names the shot and changes nothing', () => {
    const before = readFileSync(MANIFEST, 'utf8');
    const second = mkdtempSync(join(tmpdir(), 'screens-manifest-'));

    const result = add(recording(255), second, '0.6c');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /only-in-this-test-390\.png is in only one of the two recordings/);
    assert.equal(readFileSync(MANIFEST, 'utf8'), before);
  });
});
