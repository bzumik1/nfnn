import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkEntries,
  entryProblems,
  issueProblems,
  testProblems,
} from './motion-known-findings.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'motion-known-findings.mjs');

function entry(overrides = {}) {
  return {
    project: 'iphone',
    file: 'e2e/back-motion-start.spec.ts',
    title: [
      'Given the app on the home screen of a phone',
      'when Zpět is pressed, then the first frame comes early',
    ],
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
    ['an empty title', { title: [] }, /title/],
    ['a title that is no list', { title: 'when Zpět is pressed' }, /title/],
    ['an empty part of its title', { title: ['Given the app', ''] }, /title/],
    ['a line break in its title', { title: ['Given the app', 'when Zpět\nis pressed'] }, /title/],
    ['a control character in its title', { title: ['Given the app\u0007', 'when Zpět'] }, /title/],
    ['an empty step', { step: '' }, /step/],
    ['a control character in its step', { step: '/sprava\u001b opening' }, /step/],
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

describe('Given the issues of the known motion findings checked for an event', () => {
  const lookup = (states) => async (number) =>
    number in states ? { found: true, ...states[number] } : { found: false };
  const second = entry({ step: '/sprava opening' });

  test('when the event is not one the guard knows, then it refuses to judge', async () => {
    await assert.rejects(
      checkEntries([entry()], { mode: 'merge_group', lookup: lookup({}) }),
      /unknown mode merge_group/,
    );
  });

  test('when an issue is closed on a pull request, then it is an error naming the entries to remove', async () => {
    const { errors, warnings } = await checkEntries([entry(), second], {
      mode: 'pull_request',
      lookup: lookup({ 2103: { state: 'closed' } }),
    });

    assert.deepEqual(warnings, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /#2103 is closed.*remove its 2 entries/);
    assert.match(errors[0], /\/sprava opening/);
  });

  test('when an issue is closed on a push to main, then it only warns, naming the entries to remove', async () => {
    const { errors, warnings } = await checkEntries([entry(), second], {
      mode: 'push',
      lookup: lookup({ 2103: { state: 'closed' } }),
    });

    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /#2103 is closed.*remove its 2 entries/);
  });

  test('when an issue is missing or a pull request on a push to main, then it is still an error', async () => {
    const missing = await checkEntries([entry()], { mode: 'push', lookup: lookup({}) });
    const pull = await checkEntries([entry()], {
      mode: 'push',
      lookup: lookup({ 2103: { state: 'open', pullRequest: true } }),
    });

    assert.match(missing.errors.join('\n'), /#2103 does not exist/);
    assert.match(pull.errors.join('\n'), /#2103 is a pull request/);
  });

  test('when an entry is malformed, then it is an error before any issue is read', async () => {
    const { errors } = await checkEntries([entry({ metric: 'speed' })], {
      mode: 'push',
      lookup: () => {
        throw new Error('no issue should be read');
      },
    });

    assert.match(errors.join('\n'), /metric/);
  });
});

describe('Given the known motion findings and the full Playwright list', () => {
  const listOf = (tests) => ({
    suites: [
      {
        title: 'back-motion-start.spec.ts',
        file: 'back-motion-start.spec.ts',
        specs: [],
        suites: [
          {
            title: entry().title[0],
            specs: tests.map(({ project, title }) => ({
              title: title.at(-1),
              file: 'back-motion-start.spec.ts',
              tests: [{ projectName: project, results: [] }],
            })),
          },
        ],
      },
    ],
  });

  test('when every entry names a listed test of its project, then nothing is reported', () => {
    const list = listOf([{ project: 'iphone', title: entry().title }]);

    assert.deepEqual(testProblems([entry()], list), []);
  });

  test('when the test was renamed, then the entry is refused as naming no test', () => {
    const list = listOf([{ project: 'iphone', title: [entry().title[0], `${entry().title[1]}, renamed`] }]);

    assert.match(testProblems([entry()], list).join('\n'), /names no test of playwright test --list/);
  });

  test('when the test runs only in another project, then the entry is refused', () => {
    const list = listOf([{ project: 'chromium', title: entry().title }]);

    assert.match(testProblems([entry()], list).join('\n'), /\[iphone\].*names no test/);
  });

  test('when the entry names another spec file, then it is refused', () => {
    const list = listOf([{ project: 'iphone', title: entry().title }]);

    assert.match(
      testProblems([entry({ file: 'e2e/back-matrix.spec.ts' })], list).join('\n'),
      /names no test/,
    );
  });

  test('when the same test title stands in another describe, as the dark copy of a light one, then the entry is refused', () => {
    const list = listOf([{ project: 'iphone', title: entry().title }]);
    const dark = entry({ title: ['Given the app in the dark appearance', entry().title[1]] });

    assert.match(testProblems([dark], list).join('\n'), /names no test/);
  });

  test('when the list holds no test at all, then every entry is refused', () => {
    assert.equal(testProblems([entry(), entry({ project: 'chromium' })], { suites: [] }).length, 2);
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

  const run = (entries, env = {}, args = ['--mode=pull_request']) => {
    const file = join(folder, 'motion-known-findings.json');
    writeFileSync(file, JSON.stringify(entries));
    return spawnSync(process.execPath, [SCRIPT, 'entries', file, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...env },
    });
  };

  const runTests = (entries, list) => {
    const file = join(folder, 'motion-known-findings.json');
    const listFile = join(folder, 'list.json');
    writeFileSync(file, JSON.stringify(entries));
    writeFileSync(listFile, JSON.stringify(list));
    return spawnSync(process.execPath, [SCRIPT, 'tests', file, listFile], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
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

  test('when no mode is given, then it refuses to judge the entries', () => {
    const result = run([], {}, []);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--mode=pull_request\|push\|nightly/);
  });

  test('when an entry names no listed test, then the tests check fails with an annotation', () => {
    const result = runTests([entry()], { suites: [] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /::error::.*names no test of playwright test --list/);
  });

  test('when the tests check is given no list, then it fails instead of passing', () => {
    const file = join(folder, 'motion-known-findings.json');
    writeFileSync(file, JSON.stringify([entry()]));
    const result = spawnSync(process.execPath, [SCRIPT, 'tests', file], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    assert.notEqual(result.status, 0);
  });

  test('when entries exist but no token is given, then it fails instead of passing', () => {
    const result = run([entry()]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GH_TOKEN and GITHUB_REPOSITORY/);
  });
});
