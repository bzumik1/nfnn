import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import {
  backupKeyWords,
  base32Decode,
  mcpMessages,
  proofBytes,
  receiptSerial,
  statusDigest,
  syntheticPortraitPng,
  totpCode,
} from './stack-journey.mjs';

const payloadCases = JSON.parse(
  readFileSync(new URL('../shared-cases/verification/payload.json', import.meta.url), 'utf8'),
).cases.filter((item) => item.expected?.qrText && item.expected?.statusSha256);

test('Given the encoding cases of the verification payload, when the journey reads their QR text, then it gives their proof bytes and status digest', () => {
  assert.ok(payloadCases.length > 0);
  for (const item of payloadCases) {
    assert.equal(
      proofBytes(item.expected.qrText).toString('hex'),
      item.expected.payloadHex + item.expected.signatureHex,
      item.name,
    );
    assert.equal(statusDigest(item.expected.qrText), item.expected.statusSha256, item.name);
  }
});

test('Given a text that is not a verification QR, when the journey reads it, then it refuses it', () => {
  assert.throws(() => proofBytes('https://example.cz/overit#1123'), /does not start with/);
  assert.throws(() => proofBytes('https://nfnn.cz/overit#11234'), /chunk of 4 digits/);
});

test('Given the RFC 6238 SHA-1 secret, when the journey computes the code of a step, then it matches the RFC vectors', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(base32Decode(secret).toString('ascii'), '12345678901234567890');
  assert.equal(totpCode(secret, Math.floor(59 / 30), 8), '94287082');
  assert.equal(totpCode(secret, Math.floor(1111111109 / 30), 8), '07081804');
  assert.equal(totpCode(secret, Math.floor(1111111109 / 30)), '081804');
});

test('Given an age key, when the journey names words of it, then they are its 24 Czech words at those positions', () => {
  const wordlist = Array.from({ length: 2048 }, (_, index) => `w${index}`);
  const zeroKey = 'AGE-SECRET-KEY-1' + 'Q'.repeat(52) + 'ABCDEF';
  const words = backupKeyWords(zeroKey, [1, 23, 24], wordlist);
  assert.deepEqual(words.slice(0, 2), [
    { position: 1, word: 'w0' },
    { position: 23, word: 'w0' },
  ]);
  assert.equal(words[2].position, 24);
  assert.equal(words[2].word, 'w102');
});

test('Given receipt numbers, when the journey compares them, then it reads their serial', () => {
  assert.equal(receiptSerial('2026-000042'), 42);
  assert.throws(() => receiptSerial('2026-42'), /not a receipt number/);
});

test('Given the synthetic portrait, when it is decoded, then it is a square RGB PNG of the asked side', () => {
  const png = syntheticPortraitPng(32);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
  const dataStart = png.indexOf('IDAT') + 4;
  const dataLength = png.readUInt32BE(dataStart - 8);
  assert.equal(inflateSync(png.subarray(dataStart, dataStart + dataLength)).length, 32 * (1 + 32 * 3));
});

test('Given connector answers as JSON or as an event stream, when the journey reads them, then it finds the messages', () => {
  assert.deepEqual(mcpMessages('application/json', '{"id":1}'), [{ id: 1 }]);
  assert.deepEqual(
    mcpMessages('text/event-stream', 'event: message\ndata: {"id":1}\n\nevent: message\ndata: {"id":2}\n\n'),
    [{ id: 1 }, { id: 2 }],
  );
  assert.deepEqual(mcpMessages('application/json', ''), []);
});
