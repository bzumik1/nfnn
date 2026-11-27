import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryProblems, issueProblems } from './motion-known-findings.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'motion-known-findings.mjs');

function entry(overrides = {}) {
  return {
    project: 'iphone',
    file: 'e2e/back-motion-start.spec.ts',
    test: 'when Zpět is pressed, then the first frame comes early',
    metric: 'first-frame-share',
    recorded: 0.58,
    everyRun: true,
    issue: 2103,
    ...overrides,
  };
}

describe('Given the known motion findings', () => {
  test('when the list is empty, then nothing is reported', () => {
    assert.deepEqual(entryProblems([]), []);
  });

  test('when an entry is complete, then nothing is reported', () => {
    assert.deepEqual(entryProblems([entry()]), []);
    assert.deepEqual(entryProblems([entry({ step: '/sprava/darci', project: 'motion-timed' })]), []);
  });

  test('when the file is not an array, then it is refused', () => {
    assert.match(entryProblems({}).join('\n'), /JSON array/);
  });

  for (const [what, overrides, message] of [
    ['an unknown project', { project: 'firefox' }, /project/],
    ['a file outside e2e', { file: 'src/app/x.spec.ts' }, /e2e\/<name>\.spec\.ts/],
    ['an empty test title', { test: '' }, /test title/],
    ['an empty step', { step: '' }, /step/],
    ['an unknown metric', { metric: 'speed' }, /metric/],
    ['a ceiling that is no number', { recorded: '0.5' }, /recorded/],
    ['no answer whether it breached in every run', { everyRun: 'yes' }, /everyRun/],
    ['no issue', { issue: 0 }, /issue/],
  ]) {
    test(`when an entry has ${what}, then it is refused`, () => {
      assert.match(entryProblems([entry(overrides)]).join('\n'), message);
    });
  }

  test('when the same motion is listed twice, then it is refused', () => {
    assert.match(entryProblems([entry(), entry({ recorded: 0.6 })]).join('\n'), /listed twice/);
  });
});

describe('Given the issues of the known motion findings', () => {
  const issues = (states) => async (number) =>
    number in states ? { found: true, ...states[number] } : { found: false };

  test('when every issue is open, then nothing is reported', async () => {
    assert.deepEqual(await issueProblems([entry()], issues({ 2103: { state: 'open' } })), []);
  });

  test('when an issue is closed, then the entry is refused because its fix landed', async () => {
    const problems = await issueProblems([entry()], issues({ 2103: { state: 'closed' } }));
    assert.match(problems.join('\n'), /#2103 is closed/);
  });

  test('when an issue does not exist, then the entry is refused', async () => {
    assert.match((await issueProblems([entry()], issues({}))).join('\n'), /#2103 does not exist/);
  });

  test('when the number is a pull request, then the entry is refused', async () => {
    const problems = await issueProblems(
      [entry()],
      issues({ 2103: { state: 'open', pullRequest: true } }),
    );
    assert.match(problems.join('\n'), /#2103 is a pull request/);
  });
});

describe('Given the script run on a file of findings', () => {
  let folder;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'nfnn-motion-findings-'));
  });
  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  const run = (entries, env = {}) => {
    const file = join(folder, 'motion-known-findings.json');
    writeFileSync(file, JSON.stringify(entries));
    return spawnSync(process.execPath, [SCRIPT, 'entries', file], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...env },
    });
  };

  test('when the list is empty, then it passes without asking GitHub', () => {
    const result = run([]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No motion finding is known/);
  });

  test('when an entry is invalid, then it fails with an annotation', () => {
    const result = run([entry({ metric: 'speed' })]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /::error::/);
  });

  test('when entries exist but no token is given, then it fails instead of passing', () => {
    const result = run([entry()]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GH_TOKEN and GITHUB_REPOSITORY/);
  });
});
