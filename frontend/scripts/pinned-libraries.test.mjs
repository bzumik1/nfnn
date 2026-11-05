import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PINNED_LIBRARIES, unpinnedLibraries } from './pinned-libraries.mjs';

describe('Given the libraries that sign, verify, hash, encrypt or read untrusted bytes in the browser', () => {
  it('when each is listed with an exact version, then nothing is reported', () => {
    const manifest = {
      dependencies: { '@noble/curves': '2.4.0', pdfkit: '0.20.2', rxjs: '~7.8.0' },
      devDependencies: { 'fast-check': '4.10.2' },
    };

    assert.deepEqual(unpinnedLibraries(manifest), []);
  });

  it('when one takes a range, a tag or a prerelease, then each is reported with its version', () => {
    const manifest = {
      dependencies: { '@noble/curves': '^2.4.0', jsqr: '~1.4.0', pdfkit: 'latest' },
      devDependencies: { 'hash-wasm': '4.12.0-beta.1' },
    };

    assert.deepEqual(unpinnedLibraries(manifest), [
      '@noble/curves ^2.4.0',
      'jsqr ~1.4.0',
      'pdfkit latest',
      'hash-wasm 4.12.0-beta.1',
    ]);
  });

  it('when a new @noble library is added with a range, then it is reported without being listed by name', () => {
    assert.deepEqual(unpinnedLibraries({ dependencies: { '@noble/post-quantum': '^0.5.0' } }), [
      '@noble/post-quantum ^0.5.0',
    ]);
  });

  it('when a library outside the list takes a range, then it is not reported', () => {
    assert.deepEqual(unpinnedLibraries({ dependencies: { '@angular/core': '^22.2.4' } }), []);
  });

  it('when the list is read, then it holds the libraries plan v3 pins', () => {
    for (const name of ['@noble/curves', 'pdfkit', 'jsqr', 'hash-wasm', 'idb', 'client-zip']) {
      assert.ok(PINNED_LIBRARIES.includes(name), `${name} is pinned`);
    }
  });

  it('when the frontend manifest is read, then every listed library in it is pinned exactly', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

    assert.deepEqual(unpinnedLibraries(manifest), []);
  });
});
