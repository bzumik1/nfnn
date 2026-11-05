import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import {
  BANK_PHASES,
  backupKeyWords,
  bankProblems,
  base32Decode,
  mcpMessages,
  phaseMovements,
  pragueDay,
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

test('Given each bank phase, when the journey plans its movements, then the first phase pays with the symbol only and every later one also from the learned account, with an unknown payer each time', () => {
  const planned = BANK_PHASES.map((phase) => phaseMovements(phase, '4821937560', '2026-11-04'));
  assert.deepEqual(
    planned.map(({ gifts }) => gifts.map((gift) => gift.pairedBy)),
    [['VARIABLE_SYMBOL'], ['VARIABLE_SYMBOL', 'SENDER_ACCOUNT'], ['VARIABLE_SYMBOL', 'SENDER_ACCOUNT'], ['VARIABLE_SYMBOL', 'SENDER_ACCOUNT']],
  );
  const all = planned.flatMap(({ gifts, stranger }) => [...gifts, stranger]);
  assert.equal(new Set(all.map((movement) => movement.id)).size, all.length);
  assert.equal(new Set(all.map((movement) => movement.amountMinor)).size, all.length);
  for (const amount of [50_000, 70_000, 90_000]) {
    assert.ok(!all.some((movement) => movement.amountMinor === amount), 'the amounts of the gifts paired by hand stay apart');
  }
  for (const { gifts, stranger } of planned) {
    assert.equal(gifts[0].variableSymbol, '4821937560');
    assert.ok(gifts.slice(1).every((gift) => gift.variableSymbol === null && gift.account === gifts[0].account));
    assert.equal(stranger.variableSymbol, null);
    assert.notEqual(stranger.account, gifts[0].account);
    assert.ok(all.every((movement) => movement.date === '2026-11-04'));
  }
  assert.throws(() => phaseMovements('later', '1', '2026-11-04'), /unknown bank phase later/);
});

test('Given instants around midnight in Prague, when the journey names the booking day, then it is the Prague day the given days back', () => {
  assert.equal(pragueDay(new Date('2026-11-04T23:30:00Z'), 0), '2026-11-05');
  assert.equal(pragueDay(new Date('2026-11-04T22:30:00Z'), 1), '2026-11-04');
  assert.equal(pragueDay(new Date('2026-07-01T21:59:00Z'), 1), '2026-06-30');
});

test('Given the planned movements and what the site shows, when the journey checks the bank, then it names every gift missing, doubled or paired otherwise and every unknown payment paired to the donor or not listed as unpaired', () => {
  const { gifts, stranger } = phaseMovements('candidate', '4821937560', '2026-11-04');
  const planned = [...gifts.map((gift) => ({ ...gift, role: 'gift' })), { ...stranger, role: 'stranger' }];
  const donations = gifts.map((gift) => ({ amountMinor: gift.amountMinor, pairedBy: gift.pairedBy }));
  const unpaired = [{ bankTransactionId: stranger.id }];
  assert.deepEqual(bankProblems(planned, donations, unpaired), []);
  assert.deepEqual(
    bankProblems(
      planned,
      [
        { amountMinor: gifts[0].amountMinor, pairedBy: 'VARIABLE_SYMBOL' },
        { amountMinor: gifts[0].amountMinor, pairedBy: 'VARIABLE_SYMBOL' },
        { amountMinor: gifts[1].amountMinor, pairedBy: 'VARIABLE_SYMBOL' },
        { amountMinor: stranger.amountMinor, pairedBy: null },
      ],
      [],
    ),
    [
      `the donor holds the gift of ${gifts[0].amountMinor / 100} Kč 2 times`,
      `the gift of ${gifts[1].amountMinor / 100} Kč is paired by VARIABLE_SYMBOL instead of SENDER_ACCOUNT`,
      `the unknown payer's ${stranger.amountMinor / 100} Kč is paired to the donor`,
      `the unknown payer's ${stranger.amountMinor / 100} Kč (movement ${stranger.id}) is not among the unpaired payments`,
    ],
  );
  assert.deepEqual(bankProblems(planned, [], unpaired), gifts.map((gift) => `the donor does not hold the gift of ${gift.amountMinor / 100} Kč`));
});
