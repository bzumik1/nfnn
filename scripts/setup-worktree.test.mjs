import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const SETUP = join(SCRIPTS, 'setup-worktree.sh');
const INSTALL = join(SCRIPTS, 'install-node-modules.sh');
const CLEAN = join(SCRIPTS, 'clean-worktree.sh');
const PACKAGES = ['frontend', 'mcp'];

function git(cwd, ...args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.cz',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.cz',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fakeNpm(bin, log, { failIn } = {}) {
  mkdirSync(bin, { recursive: true });
  const npm = join(bin, 'npm');
  writeFileSync(
    npm,
    [
      '#!/usr/bin/env bash',
      `echo "$(basename "$PWD") $*" >> '${log}'`,
      failIn ? `[ "$(basename "$PWD")" = '${failIn}' ] && { echo "npm ERR! lock out of sync" >&2; exit 1; }` : '',
      'mkdir -p node_modules && touch node_modules/.package-lock.json',
    ].join('\n'),
  );
  chmodSync(npm, 0o755);
}

function run(script, cwd, bin) {
  return spawnSync('bash', [script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
}

function installed(root, name, ageSeconds) {
  const marker = join(root, name, 'node_modules', '.package-lock.json');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, '');
  const lock = join(root, name, 'package-lock.json');
  const now = Date.now() / 1000;
  utimesSync(lock, now, now);
  utimesSync(marker, now + ageSeconds, now + ageSeconds);
}

describe('Given a worktree with the frontend and the connector', () => {
  let scratch;
  let root;
  let bin;
  let npmLog;

  beforeEach(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'setup-worktree-')));
    root = join(scratch, 'repo');
    bin = join(scratch, 'bin');
    npmLog = join(scratch, 'npm.log');
    mkdirSync(root);
    git(root, 'init', '-q');
    for (const name of PACKAGES) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'package-lock.json'), '{}');
    }
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const calls = () => (existsSync(npmLog) ? readFileSync(npmLog, 'utf8').trim().split('\n') : []);

  test('when no package has node_modules, then npm ci runs in each and the setup is marked done', () => {
    fakeNpm(bin, npmLog);

    const result = run(SETUP, root, bin);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls().map((line) => line.split(' ').slice(0, 2).join(' ')), ['frontend ci', 'mcp ci']);
    assert.ok(existsSync(join(root, '.t3', 'setup-done')));
    assert.ok(!existsSync(join(root, '.t3', 'setup-running')));
    assert.ok(!existsSync(join(root, '.t3', 'setup-failed')));
  });

  test('when node_modules is newer than the lock file, then npm ci is skipped', () => {
    fakeNpm(bin, npmLog);
    installed(root, 'frontend', 60);
    installed(root, 'mcp', 60);

    const result = run(SETUP, root, bin);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls(), []);
    assert.ok(existsSync(join(root, '.t3', 'setup-done')));
  });

  test('when only one lock file is newer than its node_modules, then npm ci runs only there', () => {
    fakeNpm(bin, npmLog);
    installed(root, 'frontend', 60);
    installed(root, 'mcp', -60);

    const result = run(SETUP, root, bin);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls().map((line) => line.split(' ')[0]), ['mcp']);
  });

  test('when npm ci fails in one package, then the setup is marked failed with the error tail and the other package still installs', () => {
    fakeNpm(bin, npmLog, { failIn: 'frontend' });
    mkdirSync(join(root, '.t3'));
    writeFileSync(join(root, '.t3', 'setup-done'), '');

    const result = run(SETUP, root, bin);

    assert.notEqual(result.status, 0);
    assert.deepEqual(calls().map((line) => line.split(' ')[0]), ['frontend', 'mcp']);
    const failed = readFileSync(join(root, '.t3', 'setup-failed'), 'utf8');
    assert.match(failed, /npm ERR! lock out of sync/);
    assert.match(failed, /npm ci failed in frontend\//);
    assert.ok(!existsSync(join(root, '.t3', 'setup-done')));
    assert.ok(!existsSync(join(root, '.t3', 'setup-running')));
  });

  test('when the install is running, then setup-running holds the PID of the setup', () => {
    mkdirSync(bin, { recursive: true });
    const seen = join(scratch, 'seen');
    writeFileSync(
      join(bin, 'npm'),
      `#!/usr/bin/env bash\ncat '${root}/.t3/setup-running' >> '${seen}'\nmkdir -p node_modules && touch node_modules/.package-lock.json\n`,
    );
    chmodSync(join(bin, 'npm'), 0o755);

    const result = spawnSync('bash', ['-c', `echo $$ > '${scratch}/pid'; exec bash '${SETUP}'`], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });

    assert.equal(result.status, 0, result.stderr);
    const pid = readFileSync(join(scratch, 'pid'), 'utf8').trim();
    assert.deepEqual(readFileSync(seen, 'utf8').trim().split('\n'), [pid, pid]);
  });

  test('when the shared install runs alone, then it prints the failure line and exits non-zero', () => {
    fakeNpm(bin, npmLog, { failIn: 'mcp' });

    const result = spawnSync('bash', [INSTALL, root], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /npm ci failed in mcp\//);
    assert.doesNotMatch(result.stdout, /frontend/);
  });
});

describe('Given a repository with a main checkout and a linked worktree', () => {
  const OUTPUT = ['backend/build', 'frontend/dist', 'frontend/test-results', 'frontend/.angular', 'mcp/dist'];
  const KEPT = ['frontend/node_modules', 'mcp/node_modules', 'frontend/src', 'backend/src'];
  let scratch;
  let main;
  let worktree;

  function fill(root) {
    for (const path of [...OUTPUT, ...KEPT]) {
      mkdirSync(join(root, path), { recursive: true });
      writeFileSync(join(root, path, 'file'), '');
    }
  }

  beforeEach(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'clean-worktree-')));
    main = join(scratch, 'main');
    worktree = join(scratch, 'worktree');
    mkdirSync(main);
    git(main, 'init', '-q');
    git(main, 'commit', '-q', '--allow-empty', '-m', 'Start');
    git(main, 'worktree', 'add', '-q', worktree);
    fill(main);
    fill(worktree);
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  test('when cleaning the linked worktree, then only its build output is deleted', () => {
    const result = run(CLEAN, worktree, '/nonexistent');

    assert.equal(result.status, 0, result.stderr);
    for (const path of OUTPUT) assert.ok(!existsSync(join(worktree, path)), path);
    for (const path of KEPT) assert.ok(existsSync(join(worktree, path)), path);
    for (const path of [...OUTPUT, ...KEPT]) assert.ok(existsSync(join(main, path)), `main ${path}`);
  });

  test('when cleaning from a subfolder of the linked worktree, then its root build output is deleted', () => {
    const result = run(CLEAN, join(worktree, 'frontend', 'src'), '/nonexistent');

    assert.equal(result.status, 0, result.stderr);
    for (const path of OUTPUT) assert.ok(!existsSync(join(worktree, path)), path);
  });

  test('when the current directory is the main checkout, then the cleanup refuses and deletes nothing', () => {
    const result = run(CLEAN, main, '/nonexistent');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /main checkout/);
    for (const path of [...OUTPUT, ...KEPT]) assert.ok(existsSync(join(main, path)), path);
  });

  test('when build output is a link to a folder outside the worktree, then only the link goes', () => {
    const outside = join(scratch, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'file'), '');
    rmSync(join(worktree, 'mcp', 'dist'), { recursive: true });
    spawnSync('ln', ['-s', outside, join(worktree, 'mcp', 'dist')]);

    const result = run(CLEAN, worktree, '/nonexistent');

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(worktree, 'mcp', 'dist')));
    assert.ok(existsSync(join(outside, 'file')));
  });

  test('when the current directory is outside any repository, then the cleanup refuses', () => {
    const result = run(CLEAN, scratch, '/nonexistent');

    assert.notEqual(result.status, 0);
  });
});
