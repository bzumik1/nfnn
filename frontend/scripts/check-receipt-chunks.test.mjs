import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { receiptChunkProblems } from './check-receipt-chunks.mjs';

const PDF_LIBRARY =
  'const tag = "/FontFile2"; const meta = "pdfuaid"; throw new Error("Unknown font format");';
const INDEX = (scripts) =>
  `<!doctype html><html><head>${scripts.map((name) => `<link rel="modulepreload" href="${name}">`).join('')}</head><body><app-root></app-root>${scripts.map((name) => `<script src="${name}" type="module"></script>`).join('')}</body></html>`;

describe('Given a built frontend', () => {
  let dist;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'receipt-chunks-'));
    mkdirSync(join(dist, 'media'));
  });

  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  function build(files, scripts = ['main-ABCDEFGH.js', 'polyfills-ABCDEFGH.js']) {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dist, name), content);
    }
    writeFileSync(join(dist, 'index.html'), INDEX(scripts));
  }

  it('when only the receipt worker carries the PDF library and the page loads none of it, then nothing is reported', () => {
    build({
      'main-ABCDEFGH.js': 'console.log("app");',
      'polyfills-ABCDEFGH.js': '',
      'chunk-Ab_-1234.js': 'new Worker(new URL("worker-Zz_-9aBc.js", import.meta.url));',
      'worker-Zz_-9aBc.js': PDF_LIBRARY,
    });

    assert.deepEqual(receiptChunkProblems(dist), []);
  });

  it('when the PDF library lands in a chunk of the app, then that chunk is named', () => {
    build({
      'main-ABCDEFGH.js': '',
      'polyfills-ABCDEFGH.js': '',
      'chunk-Ab_-1234.js': PDF_LIBRARY,
      'worker-Zz_-9aBc.js': PDF_LIBRARY,
    });

    assert.deepEqual(receiptChunkProblems(dist), [
      'chunk-Ab_-1234.js carries the PDF library, which only the receipt worker may hold',
    ]);
  });

  it('when the page itself loads or preloads the worker, then that is reported', () => {
    build(
      {
        'main-ABCDEFGH.js': '',
        'polyfills-ABCDEFGH.js': '',
        'worker-Zz_-9aBc.js': PDF_LIBRARY,
      },
      ['main-ABCDEFGH.js', 'worker-Zz_-9aBc.js'],
    );

    assert.deepEqual(receiptChunkProblems(dist), [
      'index.html loads worker-Zz_-9aBc.js, so every visitor would fetch the PDF library',
    ]);
  });

  it('when no file carries the PDF library at all, then the check says the worker is missing', () => {
    build({ 'main-ABCDEFGH.js': '', 'polyfills-ABCDEFGH.js': '' });

    assert.deepEqual(receiptChunkProblems(dist), [
      'no worker-<hash>.js carries the PDF library, so the check found nothing to confine',
    ]);
  });
});
