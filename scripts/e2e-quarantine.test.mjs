import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkEntries,
  entryProblems,
  githubIssues,
  issueProblems,
  overdueProblems,
  testList,
  testProblems,
} from './e2e-quarantine.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'e2e-quarantine.mjs');
const NOW = Date.parse('2026-11-27T12:00:00Z');

function entry(overrides = {}) {
  return {
    project: 'iphone',
    file: 'e2e/dialog-back.spec.ts',
    title: ['Given a dialog open', 'when they go back, then it closes'],
    issue: 2093,
    since: '2026-11-27T08:00:00Z',
    ...overrides,
  };
}

function report(tests) {
  const files = new Map();
  for (const { project, file, title } of tests) {
    const name = file.replace(/^e2e\//, '');
    if (!files.has(name)) {
      files.set(name, { title: name, file: name, specs: [], suites: [] });
    }
    const [describe, it] = title;
    files.get(name).suites.push({
      title: describe,
      specs: [
        {
          title: it,
          file: name,
          tests: [{ projectName: project, results: [] }],
        },
      ],
    });
  }
  return { suites: [...files.values()] };
}

const QUARANTINED = {
  project: 'iphone',
  file: 'e2e/dialog-back.spec.ts',
  title: entry().title,
};
const OTHER = {
  project: 'chromium',
  file: 'e2e/home.spec.ts',
  title: ['Given a visitor', 'when the page opens, then it shows the hero'],
};

describe('Given the list of quarantined end-to-end tests', () => {
  test('when it is empty, then nothing is reported and the test list is empty', () => {
    assert.deepEqual(entryProblems([], NOW), []);
    assert.equal(testList([]), '');
  });

  test('when an entry is complete, open and younger than 48 h, then nothing is reported', () => {
    assert.deepEqual(entryProblems([entry()], NOW), []);
  });

  test('when the file holds no list, then it is refused', () => {
    assert.match(entryProblems({ tests: [] }, NOW).join('\n'), /must be a JSON array/);
  });

  test('when an entry names no issue, then it is refused', () => {
    const { issue, ...withoutIssue } = entry();
    assert.equal(issue, 2093);
    assert.match(entryProblems([withoutIssue], NOW).join('\n'), /issue/);
  });

  test('when an entry is older than 48 h by the clock of the check, then it is overdue', () => {
    const problems = overdueProblems([entry({ since: '2026-11-25T11:59:59Z' })], NOW);
    assert.match(problems.join('\n'), /more than 48 h.*#2093/);
  });

  test('when an entry entered exactly 48 h ago, then it is not overdue yet', () => {
    assert.deepEqual(overdueProblems([entry({ since: '2026-11-25T12:00:00Z' })], NOW), []);
  });

  test('when an entry entered in the future, then it is refused so its 48 h cannot be extended', () => {
    const problems = entryProblems([entry({ since: '2026-11-27T12:00:01Z' })], NOW);
    assert.match(problems.join('\n'), /in the future/);
  });

  test('when an entry has no time or a time without a zone, then it is refused', () => {
    assert.match(entryProblems([entry({ since: undefined })], NOW).join('\n'), /since/);
    assert.match(entryProblems([entry({ since: '2026-11-27T08:00:00' })], NOW).join('\n'), /since/);
  });

  test('when six tests are listed, then the list is refused for holding more than 5', () => {
    const entries = Array.from({ length: 6 }, (_, index) =>
      entry({
        title: ['Given a dialog open', `when case ${index}, then it closes`],
      }),
    );
    assert.match(entryProblems(entries, NOW).join('\n'), /6 tests are in quarantine, at most 5/);
  });

  test('when five tests are listed, then the count is allowed', () => {
    const entries = Array.from({ length: 5 }, (_, index) =>
      entry({
        title: ['Given a dialog open', `when case ${index}, then it closes`],
      }),
    );
    assert.deepEqual(entryProblems(entries, NOW), []);
  });

  test('when one test is listed twice, then the second entry is refused', () => {
    assert.match(entryProblems([entry(), entry({ issue: 2107 })], NOW).join('\n'), /twice/);
  });

  test('when an entry names a project the e2e shards do not run, then it is refused', () => {
    assert.match(entryProblems([entry({ project: 'pwa' })], NOW).join('\n'), /project/);
    assert.match(entryProblems([entry({ project: 'motion-timed' })], NOW).join('\n'), /project/);
    assert.deepEqual(entryProblems([entry({ project: 'device-iphone-se' })], NOW), []);
  });

  test('when an entry names a file outside e2e/ or a title Playwright cannot read back, then it is refused', () => {
    assert.match(entryProblems([entry({ file: 'src/app.spec.ts' })], NOW).join('\n'), /file/);
    assert.match(entryProblems([entry({ title: [] })], NOW).join('\n'), /title/);
    assert.match(
      entryProblems([entry({ title: ['Given a › b', 'when c'] })], NOW).join('\n'),
      /title/,
    );
  });

  test('when tests are listed, then each becomes one line of the Playwright test list', () => {
    assert.equal(
      testList([entry()]),
      '[iphone] › dialog-back.spec.ts › Given a dialog open › when they go back, then it closes\n',
    );
  });
});

describe('Given the issues of the quarantined tests', () => {
  const issues = (states) => async (number) => {
    if (!(number in states)) {
      return { found: false };
    }
    return { found: true, ...states[number] };
  };

  test('when every issue is open, then nothing is reported', async () => {
    assert.deepEqual(await issueProblems([entry()], issues({ 2093: { state: 'open' } })), []);
  });

  test('when an issue is closed, then the entry is refused because its fix landed', async () => {
    const problems = await issueProblems([entry()], issues({ 2093: { state: 'closed' } }));
    assert.match(problems.join('\n'), /#2093 is closed/);
  });

  test('when an issue does not exist, then the entry is refused', async () => {
    const problems = await issueProblems([entry()], issues({}));
    assert.match(problems.join('\n'), /#2093 does not exist/);
  });

  test('when the number is a pull request, then the entry is refused', async () => {
    const problems = await issueProblems(
      [entry()],
      issues({ 2093: { state: 'open', pullRequest: true } }),
    );
    assert.match(problems.join('\n'), /#2093 is a pull request/);
  });

  test('when GitHub is asked, then the issue is read with the token and its state returned', async () => {
    const asked = [];
    const lookup = githubIssues({
      token: 'token-value',
      repository: 'owner/repository',
      apiUrl: 'https://api.example',
      fetch: async (url, options) => {
        asked.push({ url, authorization: options.headers.Authorization });
        return { status: 200, ok: true, json: async () => ({ state: 'open' }) };
      },
    });
    assert.deepEqual(await lookup(2093), {
      found: true,
      state: 'open',
      pullRequest: false,
    });
    assert.deepEqual(asked, [
      {
        url: 'https://api.example/repos/owner/repository/issues/2093',
        authorization: 'Bearer token-value',
      },
    ]);
  });

  test('when GitHub answers 404, then the issue is not found', async () => {
    const lookup = githubIssues({
      token: 'token-value',
      repository: 'owner/repository',
      fetch: async () => ({ status: 404, ok: false }),
    });
    assert.deepEqual(await lookup(1), { found: false });
  });

  test('when GitHub answers another error, then the check fails instead of passing', async () => {
    const lookup = githubIssues({
      token: 'token-value',
      repository: 'owner/repository',
      fetch: async () => ({ status: 503, ok: false }),
    });
    await assert.rejects(lookup(1), /503/);
  });
});

describe('Given an entry past its 48 h', () => {
  const STALE = entry({ since: '2026-11-25T11:59:59Z' });
  const open = async () => ({ found: true, state: 'open' });

  test('when a pull request is checked, then the entry fails the check', async () => {
    const verdict = await checkEntries([STALE], {
      now: NOW,
      mode: 'pull_request',
      lookup: open,
    });
    assert.match(verdict.errors.join('\n'), /more than 48 h/);
    assert.deepEqual(verdict.warnings, []);
  });

  test('when a push to main is checked, then the entry only warns and the check passes', async () => {
    const verdict = await checkEntries([STALE], {
      now: NOW,
      mode: 'push',
      lookup: open,
    });
    assert.deepEqual(verdict.errors, []);
    assert.match(verdict.warnings.join('\n'), /more than 48 h.*#2093/);
  });

  test('when the nightly checks it, then the entry fails the check', async () => {
    const verdict = await checkEntries([STALE], {
      now: NOW,
      mode: 'nightly',
      lookup: open,
    });
    assert.match(verdict.errors.join('\n'), /more than 48 h/);
    assert.deepEqual(verdict.warnings, []);
  });

  test('when any mode checks it, then the overdue entries are named for a report', async () => {
    for (const mode of ['pull_request', 'push', 'nightly']) {
      const verdict = await checkEntries([STALE, entry({ title: ['Given a fresh', 'when ok'] })], {
        now: NOW,
        mode,
        lookup: open,
      });
      assert.equal(verdict.overdue.length, 1);
      assert.match(verdict.overdue[0], /dialog-back\.spec\.ts.*#2093/);
    }
  });

  test('when no mode or an unknown one is given, then the check refuses to guess', async () => {
    await assert.rejects(checkEntries([STALE], { now: NOW, lookup: open }), /mode/);
    await assert.rejects(
      checkEntries([STALE], { now: NOW, mode: 'schedule', lookup: open }),
      /mode/,
    );
  });
});

describe('Given a push to main', () => {
  const check = (entries, lookup = async () => ({ found: true, state: 'open' })) =>
    checkEntries(entries, { now: NOW, mode: 'push', lookup });

  test('when six tests are listed, then the check still fails', async () => {
    const entries = Array.from({ length: 6 }, (_, index) =>
      entry({
        title: ['Given a dialog open', `when case ${index}, then it closes`],
      }),
    );
    assert.match((await check(entries)).errors.join('\n'), /at most 5/);
  });

  test('when an issue is missing or closed, then the check still fails', async () => {
    assert.match(
      (await check([entry()], async () => ({ found: false }))).errors.join('\n'),
      /does not exist/,
    );
    assert.match(
      (await check([entry()], async () => ({ found: true, state: 'closed' }))).errors.join('\n'),
      /is closed/,
    );
  });

  test('when an entry entered in the future or has an invalid time, then the check still fails', async () => {
    assert.match(
      (await check([entry({ since: '2026-11-27T12:00:01Z' })])).errors.join('\n'),
      /in the future/,
    );
    assert.match((await check([entry({ since: 'yesterday' })])).errors.join('\n'), /since/);
  });

  test('when an entry is stale and its issue closed, then the closed issue fails and the age only warns', async () => {
    const verdict = await check([entry({ since: '2026-11-25T11:59:59Z' })], async () => ({
      found: true,
      state: 'closed',
    }));
    assert.match(verdict.errors.join('\n'), /is closed/);
    assert.doesNotMatch(verdict.errors.join('\n'), /48 h/);
    assert.match(verdict.warnings.join('\n'), /48 h/);
  });
});

describe('Given the test lists of Playwright', () => {
  test('when the listed test exists and only it is left out of the shards, then nothing is reported', () => {
    const problems = testProblems([entry()], report([QUARANTINED, OTHER]), report([OTHER]));
    assert.deepEqual(problems, []);
  });

  test('when an entry names a test that does not exist, then it is refused', () => {
    const problems = testProblems(
      [entry({ title: ['Given a dialog open', 'when renamed'] })],
      report([QUARANTINED, OTHER]),
      report([QUARANTINED, OTHER]),
    );
    assert.match(problems.join('\n'), /names no test/);
  });

  test('when the shards would still run a listed test, then it is reported', () => {
    const problems = testProblems(
      [entry()],
      report([QUARANTINED, OTHER]),
      report([QUARANTINED, OTHER]),
    );
    assert.match(problems.join('\n'), /still runs in the e2e shards/);
  });

  test('when the shards would leave out a test that is not listed, then it is reported', () => {
    const problems = testProblems([entry()], report([QUARANTINED, OTHER]), report([]));
    assert.match(problems.join('\n'), /left out of the e2e shards without an entry/);
  });
});

describe('Given the command line', () => {
  let folder;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'nfnn-e2e-quarantine-'));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  function run(args, env = {}) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...env },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  }

  function write(name, value) {
    const path = join(folder, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  }

  test('when the list is empty, then the entries pass without asking GitHub', () => {
    const result = run(['entries', write('quarantine.json', []), '--mode=pull_request']);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /No end-to-end test is in quarantine/);
  });

  async function withGitHub(states, action) {
    const server = createServer((request, response) => {
      const number = request.url.match(/^\/repos\/o\/r\/issues\/(\d+)$/)?.[1];
      if (number === undefined || !(number in states)) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ state: states[number] }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      return await action({
        GH_TOKEN: 'token-value',
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
      });
    } finally {
      server.close();
    }
  }

  function runAsync(args, env) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [SCRIPT, ...args], {
        env: { PATH: process.env.PATH, ...env },
      });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('close', (status) => resolve({ status, output }));
    });
  }

  const stale = () => write('quarantine.json', [entry({ since: '2020-01-01T00:00:00Z' })]);

  test('when the entries are checked without a mode, then the command refuses to guess', () => {
    const result = run(['entries', write('quarantine.json', [])]);
    assert.equal(result.status, 2);
    assert.match(result.output, /--mode=pull_request\|push\|nightly/);
  });

  test('when a pull request finds an entry past its 48 h, then the entries fail by the clock of the run', async () => {
    const result = await withGitHub({ 2093: 'open' }, (env) =>
      runAsync(['entries', stale(), '--mode=pull_request'], env),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*more than 48 h/);
  });

  test('when a push to main finds an entry past its 48 h, then it warns naming the entry and its issue and passes', async () => {
    const result = await withGitHub({ 2093: 'open' }, (env) =>
      runAsync(['entries', stale(), '--mode=push'], env),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /::warning::.*dialog-back\.spec\.ts.*more than 48 h.*#2093/);
    assert.doesNotMatch(result.output, /::error::/);
  });

  test('when a push to main finds a closed issue, then the entries still fail', async () => {
    const result = await withGitHub({ 2093: 'closed' }, (env) =>
      runAsync(['entries', stale(), '--mode=push'], env),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*#2093 is closed/);
  });

  test('when the nightly finds an entry past its 48 h, then it fails and writes the overdue entries for its issue', async () => {
    const overdue = join(folder, 'overdue.txt');
    const result = await withGitHub({ 2093: 'open' }, (env) =>
      runAsync(['entries', stale(), '--mode=nightly', `--overdue=${overdue}`], env),
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /::error::.*more than 48 h/);
    assert.match(
      readFileSync(overdue, 'utf8'),
      /^\[iphone\] e2e\/dialog-back\.spec\.ts.*#2093.*\n$/,
    );
  });

  test('when the nightly finds no entry past its 48 h, then it passes and the overdue file stays empty', async () => {
    const overdue = join(folder, 'overdue.txt');
    const fresh = write('quarantine.json', [
      entry({ since: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }),
    ]);
    const result = await withGitHub({ 2093: 'open' }, (env) =>
      runAsync(['entries', fresh, '--mode=nightly', `--overdue=${overdue}`], env),
    );
    assert.equal(result.status, 0, result.output);
    assert.equal(readFileSync(overdue, 'utf8'), '');
  });

  test('when tests are listed but no token is given, then the entries fail', () => {
    const quarantine = write('quarantine.json', [
      entry({ since: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }),
    ]);
    const result = run(['entries', quarantine, '--mode=push']);
    assert.equal(result.status, 1);
    assert.match(result.output, /::error::.*GH_TOKEN/);
  });

  test('when the test list is asked for, then it is printed for Playwright', () => {
    const result = run(['test-list', write('quarantine.json', [entry()])]);
    assert.equal(result.status, 0, result.output);
    assert.equal(result.output, testList([entry()]));
  });

  test('when the test list is asked for a malformed list, then it fails', () => {
    const result = run(['test-list', write('quarantine.json', [entry({ project: 'pwa' })])]);
    assert.equal(result.status, 1);
    assert.match(result.output, /::error::/);
  });

  test('when the tests are checked against the lists, then a missing test fails', () => {
    const result = run([
      'tests',
      write('quarantine.json', [entry({ title: ['Given a dialog open', 'when renamed'] })]),
      write('full.json', report([QUARANTINED])),
      write('excluded.json', report([QUARANTINED])),
    ]);
    assert.equal(result.status, 1);
    assert.match(result.output, /::error::.*names no test/);
  });
});
