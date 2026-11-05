import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shardProblems } from './check-e2e-shards.mjs';

const report = (tests) => ({
  suites: [
    {
      title: 'donate-qr.spec.ts',
      file: 'donate-qr.spec.ts',
      specs: [],
      suites: [
        {
          title: 'Given the Přispět section',
          file: 'donate-qr.spec.ts',
          specs: tests.map(({ title, project, results }) => ({
            title,
            file: 'donate-qr.spec.ts',
            tests: [{ projectName: project, results }],
          })),
        },
      ],
    },
  ],
});

const LISTED = report([
  { title: 'when 500 Kč is chosen, then the QR names it', project: 'chromium', results: [] },
  { title: 'when 500 Kč is chosen, then the QR names it', project: 'iphone', results: [] },
  { title: 'when the QR fails, then the bank details stay', project: 'chromium', results: [] },
]);

const ran = (status) => [{ status }];

describe('Given the listed end-to-end tests and the report merged from the shards', () => {
  it('when every listed test ran once, skipped ones included, then nothing is reported', () => {
    const merged = report([
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'chromium',
        results: ran('passed'),
      },
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'iphone',
        results: ran('skipped'),
      },
      {
        title: 'when the QR fails, then the bank details stay',
        project: 'chromium',
        results: ran('failed'),
      },
    ]);
    assert.deepEqual(shardProblems(LISTED, merged), []);
  });

  it('when a shard left a listed test out, then the test is named as not run', () => {
    const merged = report([
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'chromium',
        results: ran('passed'),
      },
      {
        title: 'when the QR fails, then the bank details stay',
        project: 'chromium',
        results: ran('passed'),
      },
    ]);
    assert.deepEqual(shardProblems(LISTED, merged), [
      'not run in any shard: [iphone] e2e/donate-qr.spec.ts > Given the Přispět section > when 500 Kč is chosen, then the QR names it',
    ]);
  });

  it('when a test is in the merged report without a result, then it is named as not run', () => {
    const merged = report([
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'chromium',
        results: ran('passed'),
      },
      { title: 'when 500 Kč is chosen, then the QR names it', project: 'iphone', results: [] },
      {
        title: 'when the QR fails, then the bank details stay',
        project: 'chromium',
        results: ran('passed'),
      },
    ]);
    assert.deepEqual(shardProblems(LISTED, merged), [
      'not run in any shard: [iphone] e2e/donate-qr.spec.ts > Given the Přispět section > when 500 Kč is chosen, then the QR names it',
    ]);
  });

  it('when two shards ran the same test, then it is named as run twice', () => {
    const merged = report([
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'chromium',
        results: ran('passed'),
      },
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'chromium',
        results: ran('passed'),
      },
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'iphone',
        results: ran('passed'),
      },
      {
        title: 'when the QR fails, then the bank details stay',
        project: 'chromium',
        results: ran('passed'),
      },
    ]);
    assert.deepEqual(shardProblems(LISTED, merged), [
      'run in more than one shard: [chromium] e2e/donate-qr.spec.ts > Given the Přispět section > when 500 Kč is chosen, then the QR names it',
    ]);
  });

  it('when the merged report has a test nobody listed, then it is named as unlisted', () => {
    const merged = report([
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'chromium',
        results: ran('passed'),
      },
      {
        title: 'when 500 Kč is chosen, then the QR names it',
        project: 'iphone',
        results: ran('passed'),
      },
      {
        title: 'when the QR fails, then the bank details stay',
        project: 'chromium',
        results: ran('passed'),
      },
      {
        title: 'when the QR fails, then the bank details stay',
        project: 'iphone',
        results: ran('passed'),
      },
    ]);
    assert.deepEqual(shardProblems(LISTED, merged), [
      'not listed: [iphone] e2e/donate-qr.spec.ts > Given the Přispět section > when the QR fails, then the bank details stay',
    ]);
  });
});
