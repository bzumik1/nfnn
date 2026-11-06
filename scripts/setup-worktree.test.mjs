import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
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
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = dirname(SCRIPTS);
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

async function gone(pid) {
  const deadline = Date.now() + 2_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      assert.equal(error.code, 'ESRCH');
      return;
    }
    assert.ok(Date.now() < deadline, `process ${pid} still runs`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const IN_TERMINAL = `
import os, pty, select, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execvp('bash', ['bash', '-c', 'stty tostop; exec bash "$0"', sys.argv[1]])
deadline = time.time() + 5
while time.time() < deadline:
    if select.select([fd], [], [], 0.1)[0]:
        try:
            sys.stdout.buffer.write(os.read(fd, 4096))
        except OSError:
            pass
    done, status = os.waitpid(pid, os.WNOHANG)
    if done:
        while select.select([fd], [], [], 0.1)[0]:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                break
            if not chunk:
                break
            sys.stdout.buffer.write(chunk)
        sys.exit(os.WEXITSTATUS(status) if os.WIFEXITED(status) else 128 + os.WTERMSIG(status))
os.killpg(pid, 9)
sys.exit(99)
`;

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

  test('when npm ci fails in one package, then the setup still exits 0, marks itself failed with the error tail and the other package still installs', () => {
    fakeNpm(bin, npmLog, { failIn: 'frontend' });
    mkdirSync(join(root, '.t3'));
    writeFileSync(join(root, '.t3', 'setup-done'), '');

    const result = run(SETUP, root, bin);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls().map((line) => line.split(' ')[0]), ['frontend', 'mcp']);
    const failed = readFileSync(join(root, '.t3', 'setup-failed'), 'utf8');
    assert.match(failed, /npm ERR! lock out of sync/);
    assert.match(failed, /npm ci failed in frontend\//);
    assert.ok(!existsSync(join(root, '.t3', 'setup-done')));
    assert.ok(!existsSync(join(root, '.t3', 'setup-running')));
  });

  test('when setup-running names a process that is gone, then the setup runs and replaces it', () => {
    fakeNpm(bin, npmLog);
    const gone = spawnSync('bash', ['-c', 'echo $$']).stdout.toString().trim();
    mkdirSync(join(root, '.t3'));
    writeFileSync(join(root, '.t3', 'setup-running'), `${gone}\n`);

    const result = run(SETUP, root, bin);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls().length, 2);
    assert.ok(existsSync(join(root, '.t3', 'setup-done')));
    assert.ok(!existsSync(join(root, '.t3', 'setup-running')));
  });

  test('when setup-running names a live process that is another setup, then the setup refuses and leaves the markers alone', async () => {
    fakeNpm(bin, npmLog);
    const other = join(scratch, 'other', 'setup-worktree.sh');
    mkdirSync(dirname(other));
    writeFileSync(other, 'sleep 30\n');
    const owner = spawn('bash', [other], { stdio: 'ignore' });
    try {
      mkdirSync(join(root, '.t3'));
      writeFileSync(join(root, '.t3', 'setup-running'), `${owner.pid}\n`);
      writeFileSync(join(root, '.t3', 'setup-failed'), 'earlier');

      const result = run(SETUP, root, bin);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(`already running as ${owner.pid}`));
      assert.deepEqual(calls(), []);
      assert.equal(readFileSync(join(root, '.t3', 'setup-running'), 'utf8').trim(), String(owner.pid));
      assert.equal(readFileSync(join(root, '.t3', 'setup-failed'), 'utf8'), 'earlier');
    } finally {
      owner.kill('SIGKILL');
    }
  });

  test('when setup-running names a live process that is no setup, as after a reboot reused the PID, then the setup runs', () => {
    fakeNpm(bin, npmLog);
    mkdirSync(join(root, '.t3'));
    writeFileSync(join(root, '.t3', 'setup-running'), `${process.pid}\n`);

    const result = run(SETUP, root, bin);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls().length, 2);
    assert.ok(existsSync(join(root, '.t3', 'setup-done')));
  });

  test('when two setups start at the same moment, then only one installs and the other refuses', async () => {
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, 'npm'),
      `#!/usr/bin/env bash\necho "$(basename "$PWD")" >> '${npmLog}'\nsleep 1\nmkdir -p node_modules && touch node_modules/.package-lock.json\n`,
    );
    chmodSync(join(bin, 'npm'), 0o755);
    const start = () =>
      new Promise((resolve) => {
        const child = spawn('bash', [SETUP], { cwd: root, stdio: 'ignore', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
        child.on('exit', (code) => resolve(code));
      });

    const codes = await Promise.all([start(), start()]);

    assert.deepEqual([...codes].sort(), [0, 1]);
    assert.deepEqual(calls(), ['frontend', 'mcp']);
    assert.ok(existsSync(join(root, '.t3', 'setup-done')));
  });

  test('when the setup keeps its standard input open and npm reads it, then npm reads nothing and the setup finishes', async () => {
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'npm'), '#!/usr/bin/env bash\nread -r answer\nmkdir -p node_modules && touch node_modules/.package-lock.json\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const setup = spawn('bash', [SETUP], {
      cwd: root,
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const exited = new Promise((resolve) => setup.on('exit', (code) => resolve(code)));

    const code = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve('still running'), 5_000))]);
    if (code === 'still running') process.kill(-setup.pid, 'SIGKILL');
    setup.stdin.destroy();

    assert.equal(code, 0);
    assert.ok(existsSync(join(root, '.t3', 'setup-done')));
  });

  function slowNpm() {
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, 'npm'),
      `#!/usr/bin/env bash\necho "$(basename "$PWD")" >> '${npmLog}'\nsleep 1\nmkdir -p node_modules && touch node_modules/.package-lock.json\n`,
    );
    chmodSync(join(bin, 'npm'), 0o755);
  }

  function started() {
    return new Promise((resolve) => {
      const child = spawn('bash', [SETUP], { cwd: root, stdio: 'ignore', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
      child.on('exit', (code) => resolve(code));
    });
  }

  test('when three setups start at the same moment over a stale marker, then exactly one installs', async () => {
    slowNpm();
    const gonePid = spawnSync('bash', ['-c', 'echo $$']).stdout.toString().trim();
    mkdirSync(join(root, '.t3'));
    writeFileSync(join(root, '.t3', 'setup-running'), `${gonePid}\n`);

    const codes = await Promise.all([started(), started(), started()]);

    assert.deepEqual([...codes].sort(), [0, 1, 1]);
    assert.deepEqual(calls(), ['frontend', 'mcp']);
    assert.ok(existsSync(join(root, '.t3', 'setup-done')));
    assert.ok(!existsSync(join(root, '.t3', 'setup-claim')));
  });

  test('when a crashed setup left its takeover lock over a minute ago, then the next setup removes it and runs', () => {
    fakeNpm(bin, npmLog);
    const gonePid = spawnSync('bash', ['-c', 'echo $$']).stdout.toString().trim();
    mkdirSync(join(root, '.t3', 'setup-claim'), { recursive: true });
    const old = Date.now() / 1000 - 120;
    utimesSync(join(root, '.t3', 'setup-claim'), old, old);
    writeFileSync(join(root, '.t3', 'setup-running'), `${gonePid}\n`);

    const result = run(SETUP, root, bin);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls().length, 2);
    assert.ok(!existsSync(join(root, '.t3', 'setup-claim')));
  });

  test('when a fresh takeover lock is held, then the setup over a stale marker refuses', () => {
    fakeNpm(bin, npmLog);
    const gonePid = spawnSync('bash', ['-c', 'echo $$']).stdout.toString().trim();
    mkdirSync(join(root, '.t3', 'setup-claim'), { recursive: true });
    writeFileSync(join(root, '.t3', 'setup-running'), `${gonePid}\n`);

    const result = run(SETUP, root, bin);

    assert.notEqual(result.status, 0);
    assert.deepEqual(calls(), []);
  });

  test('when the setup runs in a terminal with tostop, then its output does not stop it and the log reaches the terminal', () => {
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'npm'), '#!/usr/bin/env bash\necho "installed $(basename "$PWD")"\nmkdir -p node_modules && touch node_modules/.package-lock.json\n');
    chmodSync(join(bin, 'npm'), 0o755);

    const result = spawnSync('python3', ['-c', IN_TERMINAL, SETUP], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /installed frontend/);
    assert.match(result.stdout, /installed mcp/);
    assert.ok(existsSync(join(root, '.t3', 'setup-done')));
  });

  async function interruptedSetup(signal, { group }) {
    mkdirSync(bin, { recursive: true });
    const started = join(scratch, 'started');
    writeFileSync(join(bin, 'npm'), `#!/usr/bin/env bash\necho $$ > '${started}'\nsleep 30\n`);
    chmodSync(join(bin, 'npm'), 0o755);
    const setup = spawn('bash', [SETUP], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const exited = new Promise((resolve) => setup.on('exit', (code) => resolve(code)));
    const deadline = Date.now() + 10_000;
    while (!existsSync(started) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(existsSync(started), 'npm never started');
    const npm = Number(readFileSync(started, 'utf8'));
    process.kill(group ? -setup.pid : setup.pid, signal);
    const code = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve('still running'), 5_000))]);
    if (code === 'still running') process.kill(-setup.pid, 'SIGKILL');
    return { code, npm };
  }

  test('when its process group gets SIGHUP during the install, then the install stops and the setup exits 129 marked failed', async () => {
    const { code, npm } = await interruptedSetup('SIGHUP', { group: true });

    assert.equal(code, 129);
    assert.ok(existsSync(join(root, '.t3', 'setup-failed')));
    assert.ok(!existsSync(join(root, '.t3', 'setup-running')));
    await gone(npm);
  });

  test('when the setup alone gets SIGTERM during the install, then it stops the install and exits 143 marked failed', async () => {
    const { code, npm } = await interruptedSetup('SIGTERM', { group: false });

    assert.equal(code, 143);
    assert.ok(existsSync(join(root, '.t3', 'setup-failed')));
    assert.ok(!existsSync(join(root, '.t3', 'setup-running')));
    await gone(npm);
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

  test('when the shared install gets a relative root, then it installs both packages', () => {
    fakeNpm(bin, npmLog);

    const result = spawnSync('bash', [INSTALL, relative(scratch, root)], {
      cwd: scratch,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls().map((line) => line.split(' ')[0]), ['frontend', 'mcp']);
  });

  test('when a package folder is missing, then the shared install names it and exits non-zero', () => {
    fakeNpm(bin, npmLog);
    rmSync(join(root, 'mcp'), { recursive: true });

    const result = spawnSync('bash', [INSTALL, root], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /no mcp\/ in /);
    assert.deepEqual(calls().map((line) => line.split(' ')[0]), ['frontend']);
  });

  test('when the shared install gets no root, then it exits with its usage', () => {
    const result = spawnSync('bash', [INSTALL], { encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /usage/);
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

describe('Given the T3 Code project file', () => {
  const project = JSON.parse(readFileSync(join(REPOSITORY, 't3.json'), 'utf8'));

  test('when T3 Code creates a worktree, then exactly one script runs and holds the agent until it ends', () => {
    const onCreate = project.scripts.filter((script) => script.runOnWorktreeCreate);

    assert.equal(onCreate.length, 1);
    assert.equal(onCreate[0].async, false);
  });

  test('when a script runs a shell script of the repository, then that file exists', () => {
    const named = project.scripts.flatMap((script) => [...script.command.matchAll(/bash (\S+\.sh)/g)].map((match) => match[1]));

    assert.ok(named.length > 0);
    for (const path of named) assert.ok(existsSync(join(REPOSITORY, path)), path);
  });
});
